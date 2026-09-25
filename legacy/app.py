"""
سيرفر مداد — يولّد قصة "موضوع خاص" من نموذج علام المدرّب (ALLaM-7B + LoRA)
ويرجعها بنفس هيكل Story اللي يستخدمه التطبيق (src/data/stories.ts).

التشغيل:  uvicorn app:app --host 0.0.0.0 --port 8000
المتغيرات (Environment):
  ADAPTER_REPO   مستودع الـ LoRA adapter على Hugging Face  (مثال: fajer/midad-allam-lora)
  HF_TOKEN       توكن Hugging Face (قراءة) — يبقى في السيرفر فقط
  ALLOWED_ORIGINS  عناوين الواجهة المسموحة، مفصولة بفواصل (الافتراضي: كل العناوين)
"""

import os
import re
import threading
import uuid

import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

# ─── الإعدادات ────────────────────────────────────────────────────────────────
BASE_MODEL = "humain-ai/ALLaM-7B-Instruct-preview"
ADAPTER_REPO = os.environ.get("ADAPTER_REPO", "")
HF_TOKEN = os.environ.get("HF_TOKEN") or None
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()]

# نفس نص الـ system المستخدم في داتا التدريب حرفياً — لا تعدّليه
SYSTEM_PROMPT = (
    "أنت كاتب قصص تعليمية للأطفال من عمر 7 إلى 10 سنوات. مهمتك تحويل الدروس التعليمية إلى قصص "
    "ممتعة وسهلة الفهم مع المحافظة على دقة المعلومات وإضافة لمسات طبيعية من البيئة والثقافة السعودية. "
    "عند ذكر مكان القصة، استخدمي دائماً اسم مدينة أو منطقة سعودية حقيقية ومميزة (مثل الأحساء، أبها، "
    "العُلا، القصيم، جدة، الطائف، حائل، نجران، الدمام) تُضفي على القصة نكهة محلية واضحة، وتجنّبي وصف "
    "المكان بكلمة عامة مجردة من دون اسم مدينة أو منطقة (مثل «المدرسة» أو «المنزل» أو «الفصل» أو "
    "«المسجد» لوحدها)."
)

# إعدادات التوليد (إصلاح التكرار وتسرّب عبارات الشات بوت)
GEN_KWARGS = dict(
    max_new_tokens=900,          # أطول قصة بالداتا ~2400 حرف
    do_sample=True,
    temperature=0.7,
    top_p=0.9,
    repetition_penalty=1.15,
    no_repeat_ngram_size=6,
)
STOP_STRINGS = ["[INST]", "[/INST]", "<|", "\nuser", "\nassistant", "\nUser:", "\nالمستخدم:"]

# ─── تحميل النموذج مرة وحدة عند تشغيل السيرفر ──────────────────────────────────
print("⏳ تحميل النموذج...")
tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, token=HF_TOKEN, trust_remote_code=True)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

# T4 (Kaggle/Colab) ما يدعم bf16 بشكل كامل، فنستخدم float16
compute_dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
base = AutoModelForCausalLM.from_pretrained(
    BASE_MODEL,
    quantization_config=BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=compute_dtype,
        bnb_4bit_use_double_quant=True,
    ),
    device_map={"": 0},
    token=HF_TOKEN,
    trust_remote_code=True,
)
if ADAPTER_REPO:
    model = PeftModel.from_pretrained(base, ADAPTER_REPO, token=HF_TOKEN)
    print(f"✅ تم تحميل الـ adapter: {ADAPTER_REPO}")
else:
    model = base
    print("⚠️ ADAPTER_REPO فاضي — يشتغل النموذج الأساسي بدون تدريب مداد")
model.eval()
gen_lock = threading.Lock()  # طلب واحد على الـ GPU بكل مرة

# ─── بناء الـ prompt بنفس قالب التدريب ─────────────────────────────────────────
def build_user_prompt(lesson: str, grade: str) -> str:
    return (
        f"عنوان الدرس:\n{lesson}\n\n"
        "المهمة:\n"
        f"حوّل هذا الدرس إلى قصة تعليمية ممتعة ومناسبة لطفل سعودي في {grade}، "
        "مع المحافظة على دقة المعلومات التعليمية."
    )


def generate_story_text(lesson: str, grade: str) -> str:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": build_user_prompt(lesson, grade)},
    ]
    inputs = tokenizer.apply_chat_template(
        messages, tokenize=True, add_generation_prompt=True,
        return_dict=True, return_tensors="pt",
    ).to(model.device)
    with gen_lock, torch.no_grad():
        out = model.generate(
            **inputs,
            **GEN_KWARGS,
            eos_token_id=tokenizer.eos_token_id,
            pad_token_id=tokenizer.pad_token_id,
            stop_strings=STOP_STRINGS,
            tokenizer=tokenizer,
        )
    text = tokenizer.decode(out[0][inputs["input_ids"].shape[-1]:], skip_special_tokens=True)
    return clean_text(text)


# ─── تنظيف النص ───────────────────────────────────────────────────────────────
CHATBOT_LINE = re.compile(
    r"^\s*(بالتأكيد|بالطبع|إليك|إليكِ|حسناً|حسنًا|هذه قصة|فيما يلي|أتمنى|آمل|هل تريد|هل ترغب|"
    r"إذا كنت|إذا أردت|لا تتردد|ملاحظة:|القصة:|عنوان القصة:)"
)


def clean_text(text: str) -> str:
    for s in STOP_STRINGS:
        text = text.split(s)[0]
    text = text.replace("\r", "").strip()
    lines = [l for l in text.split("\n")]
    # احذف عبارات الشات بوت من البداية والنهاية فقط
    while lines and (not lines[0].strip() or CHATBOT_LINE.match(lines[0])):
        lines.pop(0)
    while lines and (not lines[-1].strip() or CHATBOT_LINE.match(lines[-1])):
        lines.pop()
    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    # لو القصة انقطعت بنص جملة (وصلت max_new_tokens) نقصّها عند آخر جملة كاملة
    if text and text[-1] not in ".!؟?»\"":
        cut = max(text.rfind(c) for c in [".", "!", "؟", "»"])
        if cut > len(text) * 0.6:
            text = text[: cut + 1]
    return text


# ─── تقسيم القصة إلى أجزاء ────────────────────────────────────────────────────
MAX_PART_CHARS = 450


def split_sentences(par: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!؟?])\s+", par) if s.strip()]


def split_into_parts(text: str) -> list[str]:
    """يقسم القصة إلى ٢–٥ أجزاء متقاربة الطول، بدون ما يقطع جملة."""
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
    # فقرة طويلة جداً → نقسمها على الجمل
    units: list[str] = []
    for p in paras:
        if len(p) <= MAX_PART_CHARS:
            units.append(p)
            continue
        chunk = ""
        for s in split_sentences(p):
            if chunk and len(chunk) + len(s) > MAX_PART_CHARS:
                units.append(chunk)
                chunk = s
            else:
                chunk = f"{chunk} {s}".strip()
        if chunk:
            units.append(chunk)
    total = sum(len(u) for u in units)
    k = max(2, min(5, round(total / 400), len(units)))
    target = total / k
    parts: list[str] = []
    current, acc = [], 0
    for i, u in enumerate(units):
        current.append(u)
        acc += len(u)
        remaining_units = len(units) - i - 1
        remaining_parts = k - len(parts) - 1
        if remaining_parts > 0 and (acc >= target * (len(parts) + 1) or remaining_units == remaining_parts):
            parts.append("\n\n".join(current))
            current = []
    if current:
        parts.append("\n\n".join(current))
    return parts


# ─── تحويل القصة إلى كائن Story ───────────────────────────────────────────────
REGIONS = [  # (الاسم كما يظهر في النص, الأيقونة)
    ("الأحساء", "palm-tree"), ("العلا", "columns"), ("جدة", "anchor"),
    ("ينبع", "anchor"), ("الدمام", "wave"), ("الخبر", "wave"), ("الجبيل", "wave"),
    ("أبها", "sprout"), ("الباحة", "sprout"), ("الطائف", "rose"), ("حائل", "camel"),
    ("نجران", "jar"), ("القصيم", "palm-tree"), ("بريدة", "palm-tree"), ("عنيزة", "palm-tree"),
    ("الربع الخالي", "dune"), ("تبوك", "dune"), ("الجوف", "dune"), ("جازان", "leaf"),
    ("مكة", "mosque"), ("المدينة المنورة", "mosque"), ("الرياض", "columns"), ("الدرعية", "columns"),
]
ORDINALS = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن",
            "التاسع", "العاشر", "الحادي عشر", "الثاني عشر"]
AR_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")
TOTAL_XP = 400  # نفس MAX_SCORE في AdventureScreen — قراءة القصة كاملة = النتيجة الكاملة


def detect_region(text: str) -> tuple[str, str]:
    """أول مدينة سعودية تُذكر في القصة (كلمة كاملة، مع حروف الجر: بـ، لـ، و، ف، في)."""
    text = re.sub(r"[\u064B-\u0652\u0640]", "", text)  # نشيل التشكيل: الخُبر → الخبر
    best = None
    for name, icon in REGIONS:
        m = re.search(rf"(?<![\u0621-\u064A])[وبلفك]?{name}(?![\u0621-\u064A])", text)
        if m and (best is None or m.start() < best[0]):
            best = (m.start(), name, icon)
    if best:
        return best[1], best[2]
    return "المملكة العربية السعودية", "map"


def reading_time(text: str) -> str:
    minutes = max(3, round(len(text) / 250))
    unit = "دقائق" if minutes <= 10 else "دقيقة"
    return f"{minutes} {unit}".translate(AR_DIGITS)


def build_story(lesson: str, grade: str, subject: str, text: str) -> dict:
    parts = split_into_parts(text)
    region, region_icon = detect_region(text)
    n = len(parts)
    xp_each = TOTAL_XP // n
    nodes = {}
    for i, part in enumerate(parts):
        node_id = f"part_{i + 1}"
        is_last = i == n - 1
        nodes[node_id] = {
            "id": node_id,
            "type": "ending" if is_last else "narrative",
            "scene": region,  # نفس المشهد → بدون شاشة انتقال بين الأجزاء
            "title": "الخاتمة" if is_last and n > 1 else f"الجزء {ORDINALS[i] if i < len(ORDINALS) else i + 1}",
            "text": part,
            "xp": xp_each + (TOTAL_XP - xp_each * n if is_last else 0),
            **({"concept": lesson} if is_last else {}),
            **({} if is_last else {"next": f"part_{i + 2}"}),
        }
    first_sentence = split_sentences(parts[0])[0] if parts else ""
    return {
        "id": f"custom-{uuid.uuid4().hex[:8]}",
        "title": lesson,
        "subject": subject or "موضوع خاص",
        "grade": grade,
        "region": region,
        "regionIcon": region_icon,
        "difficulty": "سهل",
        "duration": reading_time(text),
        "description": first_sentence[:120],
        "cover": "https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800&h=450&fit=crop&auto=format",
        "mapPosition": {"x": 50, "y": 50},
        "concepts": [lesson],
        "nodes": nodes,
        "startNode": "part_1",
    }


# ─── الـ API ─────────────────────────────────────────────────────────────────
app = FastAPI(title="Medad Story API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    lesson: str = Field(..., min_length=2, max_length=120)
    grade: str = Field(..., min_length=2, max_length=60)
    subject: str = Field("", max_length=60)


@app.get("/health")
def health():
    return {"status": "ok", "adapter": ADAPTER_REPO or None}


@app.post("/generate")
def generate(req: GenerateRequest):  # def (مو async) → FastAPI يشغلها في thread منفصل
    lesson, grade = req.lesson.strip(), req.grade.strip()
    text = ""
    for _ in range(2):  # محاولة ثانية لو طلع الرد فاضي أو قصير جداً
        text = generate_story_text(lesson, grade)
        if len(text) >= 200:
            break
    if len(text) < 200:
        raise HTTPException(status_code=502, detail="النموذج ما قدر يكتب قصة مناسبة، جرّبي مرة ثانية.")
    return build_story(lesson, grade, req.subject.strip(), text)
