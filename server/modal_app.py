"""
مداد على Modal — سيرفر دائم برابط ثابت، يشتغل لحاله وقت الطلب ويطفي نفسه وقت الفراغ.

النموذج: النسخة المدموجة (merged_full_model) من Kaggle Models: lama377/midad-allam-7b
الإعدادات (system prompt + التوليد + التنظيف) منقولة من نوتبوك midad-allam-merged-inference.

الأوامر (من مجلد server):
  1) modal run modal_app.py::download_model    ← مرة وحدة: ينزّل النموذج في Volume
  2) modal deploy modal_app.py                  ← ينشر السيرفر ويطبع الرابط الثابت
"""

import os

import modal

APP_NAME = "medad"
KAGGLE_MODEL = "lama377/midad-allam-7b/transformers/default/1"
MODELS_DIR = "/models"

app = modal.App(APP_NAME)
volume = modal.Volume.from_name("medad-models", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        # النموذج انحفظ بـ transformers 5 على Kaggle، فلازم نفس الإصدار الرئيسي
        "torch==2.8.0",
        "transformers>=5.0,<6",
        "accelerate>=1.0",
        "sentencepiece",
        "kagglehub>=0.3",
        "huggingface_hub>=0.25",
        "fastapi[standard]",
    )
    .env({"KAGGLEHUB_CACHE": f"{MODELS_DIR}/kagglehub", "HF_HOME": f"{MODELS_DIR}/hf"})
)


def find_model_dir() -> str:
    """نفس فكرة النوتبوك: نلقى المجلد اللي فيه ملفات النموذج."""
    for root, _dirs, files in os.walk(MODELS_DIR):
        if "config.json" in files and any(f.endswith(".safetensors") for f in files):
            return root
    raise RuntimeError("ما لقيت النموذج في الـ Volume — شغّلي download_model أول")


# ─── ١) تنزيل النموذج مرة وحدة ─────────────────────────────────────────────────
@app.function(image=image, volumes={MODELS_DIR: volume}, timeout=60 * 60,
              secrets=[modal.Secret.from_name("medad-secrets")])
def download_model():
    hf_repo = os.environ.get("HF_MODEL_REPO")  # اختياري: لو رفعتوا النموذج على Hugging Face
    if hf_repo:
        from huggingface_hub import snapshot_download
        path = snapshot_download(hf_repo, local_dir=f"{MODELS_DIR}/hf-model",
                                 token=os.environ.get("HF_TOKEN"))
    else:
        import kagglehub
        path = kagglehub.model_download(KAGGLE_MODEL)
    volume.commit()
    print("✅ تم التنزيل:", path)
    print("📁 مجلد النموذج:", find_model_dir())


# ─── ٢) منطق القصة (prompt + تنظيف + تقسيم + تحويل لـ Story) ─────────────────
import re  # noqa: E402
import uuid  # noqa: E402

# نفس الـ system prompt المستخدم في نوتبوك الاستدلال (midad-allam-merged-inference)
SYSTEM_PROMPT = (
    "أنت كاتب قصص تعليمية للأطفال من عمر 7 إلى 10 سنوات. "
    "مهمتك تحويل الدرس المعطى إلى قصة تعليمية ممتعة وواضحة ومناسبة لعمر الطفل، "
    "مع المحافظة على دقة المعلومات الواردة في الدرس.\n\n"
    "قواعد مهمة:\n"
    "1) التزم بالمحتوى التعليمي وأهداف التعلم والمفاهيم الأساسية الموجودة في الدرس.\n"
    "2) لا تضف معلومات علمية أو رياضية أو صحية غير متأكد من صحتها.\n"
    "3) حاول تغطية جميع أهداف التعلم والمفاهيم الأساسية داخل أحداث القصة.\n"
    "4) إذا كان الدرس يحتوي على أرقام أو عمليات حسابية، "
    "تأكد من صحة النتائج قبل كتابتها.\n"
    "5) لا تخلط بين المفاهيم المختلفة أو المتشابهة.\n"
    "6) استخدم أمثلة بسيطة وواضحة ومناسبة للأطفال.\n"
    "7) أضف لمسات طبيعية من البيئة والثقافة السعودية، "
    "وعند ذكر مكان استخدم مدينة أو منطقة سعودية حقيقية بشكل طبيعي.\n"
    "8) اجعل القصة مترابطة من البداية للنهاية.\n"
    "9) أخرج القصة فقط دون ملاحظات أو شرح أو ملخص بعد نهايتها.\n"
    "10) لا تكتب رموزاً أو قوالب مثل "
    "[INST] أو [/INST] أو <<SYS>> أو </SYS> أو [END_TEXT] أو روابط.\n"
    "11) عندما تنتهي القصة، توقف مباشرة."
)

# نفس إعدادات التوليد في النوتبوك
GEN_KWARGS = dict(
    max_new_tokens=400,
    do_sample=False,
    repetition_penalty=1.12,
    no_repeat_ngram_size=4,
)

# نفس قائمة التنظيف الاحتياطي في النوتبوك + عبارات أدوار الشات
STOP_STRINGS = [
    "[INST]", "[/INST]", "<<SYS>>", "<</SYS>>", "</SYS>", "[END_TEXT]", "[/END_TEXT]",
    "[END_OF_TEXT]", "[/END_OF_TEXT]", "<![CDATA[", "CDATA",
    "\nuser", "\nassistant", "\nUser:", "\nالمستخدم:",
]


def build_user_prompt(lesson: str, grade: str) -> str:
    return (
        f"عنوان الدرس:\n{lesson}\n\n"
        "المهمة:\n"
        f"حوّل هذا الدرس إلى قصة تعليمية ممتعة ومناسبة لطفل سعودي في {grade}."
    )


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



# ─── ٣) السيرفر ──────────────────────────────────────────────────────────────
@app.cls(
    image=image,
    gpu="L4",                      # 24GB — يكفي النموذج المدموج بدقة float16
    volumes={MODELS_DIR: volume},
    scaledown_window=5 * 60,       # يطفي بعد ٥ دقائق بدون طلبات (ما يصرف رصيد)
    timeout=10 * 60,
)
class Medad:
    @modal.enter()
    def load(self):
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        model_dir = find_model_dir()
        self.tokenizer = AutoTokenizer.from_pretrained(model_dir, trust_remote_code=True)
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token
        self.model = AutoModelForCausalLM.from_pretrained(
            model_dir, dtype=torch.float16, device_map="cuda", trust_remote_code=True,
        )
        self.model.eval()
        print("✅ Midad model loaded:", model_dir)

    def generate_story_text(self, lesson: str, grade: str) -> str:
        import torch

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": build_user_prompt(lesson, grade)},
        ]
        inputs = self.tokenizer.apply_chat_template(
            messages, tokenize=True, add_generation_prompt=True,
            return_dict=True, return_tensors="pt",
        ).to(self.model.device)
        with torch.no_grad():
            out = self.model.generate(
                **inputs,
                **GEN_KWARGS,
                eos_token_id=self.tokenizer.eos_token_id,
                pad_token_id=self.tokenizer.pad_token_id,
            )
        text = self.tokenizer.decode(out[0][inputs["input_ids"].shape[-1]:], skip_special_tokens=True)
        return clean_text(text)

    @modal.asgi_app()
    def web(self):
        from fastapi import FastAPI, HTTPException
        from fastapi.middleware.cors import CORSMiddleware
        from pydantic import BaseModel, Field

        api = FastAPI(title="Medad Story API")
        api.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_methods=["GET", "POST"],
            allow_headers=["*"],
        )

        class GenerateRequest(BaseModel):
            lesson: str = Field(..., min_length=2, max_length=120)
            grade: str = Field(..., min_length=2, max_length=60)
            subject: str = Field("", max_length=60)

        @api.get("/health")
        def health():
            return {"status": "ok"}

        @api.post("/generate")
        def generate(req: GenerateRequest):
            lesson, grade = req.lesson.strip(), req.grade.strip()
            text = self.generate_story_text(lesson, grade)
            if len(text) < 200:
                raise HTTPException(status_code=502, detail="النموذج ما قدر يكتب قصة مناسبة، جرّبي مرة ثانية.")
            return build_story(lesson, grade, req.subject.strip(), text)

        return api
