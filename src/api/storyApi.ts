import { Story } from "../data/stories";

// رابط السيرفر من ملف .env (VITE_API_URL) — بدون / في النهاية
const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

// نموذج 7B ممكن ياخذ دقيقة أو أكثر، فنعطيه مهلة كافية
const TIMEOUT_MS = 180_000;

export async function generateCustomStory(lesson: string, grade: string, subject: string): Promise<Story> {
  if (!API_URL) {
    throw new Error("رابط السيرفر غير مضبوط — أضيفي VITE_API_URL في ملف .env");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${API_URL}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lesson, grade, subject }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.detail && typeof body.detail === "string" ? body.detail : `خطأ من السيرفر (${res.status})`);
    }

    const story = (await res.json()) as Story;
    if (!story?.nodes || !story.startNode || !story.nodes[story.startNode]) {
      throw new Error("وصل رد غير مكتمل من السيرفر");
    }
    return story;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("السيرفر تأخر كثير في الرد، جرّبي مرة ثانية");
    }
    if (err instanceof TypeError) {
      throw new Error("ما قدرنا نوصل للسيرفر — تأكدي إن نوتبوك Kaggle شغال والرابط صحيح");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ندق على السيرفر أول ما يفتح التطبيق عشان يبدأ يحمّل النموذج بدري (Modal يطفي نفسه وقت الفراغ)
export function warmUpServer(): void {
  if (!API_URL) return;
  fetch(`${API_URL}/health`).catch(() => {
    /* عادي لو فشل — الطلب الحقيقي بيصحّيه */
  });
}
