import { useEffect, useRef, useState } from "react";
import Stars from "./Stars";
import Icon, { IconName } from "./Icons";
import { Story } from "../data/stories";
import { generateCustomStory } from "../api/storyApi";

const buildSteps: { icon: IconName; label: string }[] = [
  { icon: "book-stack", label: "تحليل محتوى الدرس" },
  { icon: "map", label: "اختيار المنطقة السعودية" },
  { icon: "pencil", label: "بناء حبكة القصة" },
  { icon: "book", label: "تقسيم القصة إلى أجزاء" },
  { icon: "masks", label: "صياغة الشخصيات والحوارات" },
  { icon: "gear", label: "ضبط مستوى الصعوبة" },
  { icon: "sparkle", label: "المراجعة النهائية" },
];

// Loading lines shown while the model writes (the real story isn't streamed)
const streamLines = [
  "نختار مدينة سعودية تناسب القصة...",
  "نرسم شخصيات القصة وأسماءها...",
  "نربط أحداث القصة بمعلومات الدرس...",
  "نكتب الحوار بلغة سهلة وممتعة...",
  "نراجع دقة المعلومات...",
];

// كم ثانية نعطي كل خطوة (تقريبي) — النموذج ياخذ عادة ٣٠–٩٠ ثانية
const STEP_MS = 9000;

interface Props {
  lesson: string;
  grade: string;
  subject: string;
  onComplete: (story: Story) => void;
  onBack: () => void;
}

export default function GeneratingScreen({ lesson, grade, subject, onComplete, onBack }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [streamText, setStreamText] = useState("");
  const [streamLineIdx, setStreamLineIdx] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // نحفظ الطلب في ref عشان React.StrictMode ما يرسله مرتين
  const requestRef = useRef<{ attempt: number; promise: Promise<Story> } | null>(null);

  // الطلب الفعلي للسيرفر
  useEffect(() => {
    if (!requestRef.current || requestRef.current.attempt !== attempt) {
      requestRef.current = { attempt, promise: generateCustomStory(lesson, grade, subject) };
    }
    let active = true;
    let finishTimer: ReturnType<typeof setTimeout>;
    requestRef.current.promise
      .then((story) => {
        if (!active) return;
        setCurrentStep(buildSteps.length - 1);
        setDone(true);
        finishTimer = setTimeout(() => onComplete(story), 900);
      })
      .catch((err: Error) => {
        if (active) setError(err.message || "صار خطأ غير متوقع");
      });
    return () => {
      active = false;
      clearTimeout(finishTimer);
    };
  }, [attempt, lesson, grade, subject, onComplete]);

  // تقدّم الخطوات — يوقف قبل الأخيرة لين يوصل الرد
  useEffect(() => {
    if (done || error) return;
    const interval = setInterval(() => {
      setCurrentStep((prev) => Math.min(prev + 1, buildSteps.length - 2));
    }, STEP_MS);
    return () => clearInterval(interval);
  }, [done, error]);

  const retry = () => {
    setError(null);
    setDone(false);
    setCurrentStep(0);
    setAttempt((a) => a + 1);
  };

  // Stream text effect
  useEffect(() => {
    if (done || error) return;
    const line = streamLines[streamLineIdx % streamLines.length];
    let i = streamText.length;
    const tick = setTimeout(() => {
      if (i < line.length) {
        setStreamText(line.slice(0, i + 1));
      } else {
        setTimeout(() => {
          setStreamText("");
          setStreamLineIdx((prev) => prev + 1);
        }, 600);
      }
    }, 45);
    return () => clearTimeout(tick);
  }, [streamText, streamLineIdx, done, error]);

  const progress = ((currentStep + 1) / buildSteps.length) * 100;

  return (
    <div className="relative h-full desert-gradient flex items-center justify-center overflow-y-auto">
      <Stars count={100} />

      <div className="relative z-10 w-full max-w-xl px-6 py-12">
        {/* Central orb */}
        <div className="flex justify-center mb-10">
          <div className="relative">
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center text-4xl animate-pulse-glow"
              style={{
                background: "radial-gradient(circle at 35% 35%, #d4a843, #8b4513)",
                boxShadow: "0 0 60px rgba(212,168,67,0.4), 0 0 120px rgba(212,168,67,0.1)",
              }}
            >
              {done ? <Icon name="check" size={32} /> : <Icon name={buildSteps[currentStep].icon} size={32} filled={buildSteps[currentStep].icon === "sparkle"} />}
            </div>
            {/* Orbit ring */}
            <svg className="absolute inset-0 w-full h-full -rotate-90 animate-spin"
              style={{ animationDuration: "8s" }} viewBox="0 0 96 96">
              <circle cx="48" cy="48" r="44" fill="none" stroke="rgba(212,168,67,0.15)" strokeWidth="1.5"
                strokeDasharray="8 4" />
            </svg>
          </div>
        </div>

        <div className="text-center mb-8">
          <h2 className="font-display text-3xl mb-1.5" style={{ color: "#f0e6c8" }}>
            {error ? "ما قدرنا نكتب القصة" : done ? "المغامرة جاهزة!" : "الذكاء الاصطناعي يكتب قصتك"}
          </h2>
          <p className="text-sm" style={{ color: "#8fa3b0" }}>
            {done ? `«${lesson}» — جاهز للانطلاق` : `يبني عالماً حول «${lesson}»`}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div
            className="rounded-2xl px-5 py-4 mb-6 text-right"
            style={{ background: "rgba(127,29,29,0.25)", border: "1px solid rgba(248,113,113,0.3)" }}
          >
            <p className="text-sm mb-4 inline-flex items-center gap-2" style={{ color: "#fca5a5" }}>
              <Icon name="warning" size={16} /> {error}
            </p>
            <div className="flex gap-3">
              <button
                onClick={retry}
                className="px-5 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2"
                style={{ background: "#d4a843", color: "#1a1a2e" }}
              >
                <Icon name="undo" size={14} /> حاول مرة ثانية
              </button>
              <button
                onClick={onBack}
                className="px-5 py-2 rounded-xl text-sm inline-flex items-center gap-2"
                style={{ background: "rgba(255,255,255,0.06)", color: "#a8b9c8" }}
              >
                <Icon name="arrow-right" size={14} /> تعديل الموضوع
              </button>
            </div>
          </div>
        )}

        {/* Streaming preview */}
        {!error && <div
          className="rounded-2xl px-5 py-4 mb-6 min-h-16 text-right"
          style={{ background: "rgba(17,24,39,0.7)", border: "1px solid rgba(212,168,67,0.1)" }}
        >
          <p className="text-xs mb-2 font-semibold" style={{ color: "#6b7f8e" }}>معاينة القصة:</p>
          <p className="text-sm leading-loose font-display" style={{ color: "#d4c89e", minHeight: "1.5rem" }}>
            {streamText}
            {!done && !error && (
              <span className="inline-block w-0.5 h-4 bg-amber-400 animate-pulse mr-0.5 align-middle" />
            )}
          </p>
        </div>}

        {/* Steps */}
        <div className="space-y-2 mb-6">
          {buildSteps.map((step, i) => (
            <div key={i}
              className="flex items-center gap-3 rounded-xl px-4 py-2.5 transition-all duration-400"
              style={{
                background: i < currentStep ? "rgba(22,101,52,0.2)"
                  : i === currentStep ? "rgba(212,168,67,0.1)"
                  : "rgba(255,255,255,0.02)",
                border: i === currentStep ? "1px solid rgba(212,168,67,0.3)" : "1px solid transparent",
                opacity: i > currentStep ? 0.25 : 1,
              }}>
              <span className="shrink-0 inline-flex" style={{ color: i < currentStep ? "#4ade80" : i === currentStep ? "#d4a843" : "#8fa3b0" }}>
                {i < currentStep ? <Icon name="check" size={16} /> : <Icon name={step.icon} size={16} filled={step.icon === "sparkle"} />}
              </span>
              <span className="text-sm"
                style={{ color: i < currentStep ? "#4ade80" : i === currentStep ? "#d4a843" : "#8fa3b0" }}>
                {step.label}
              </span>
              {i === currentStep && !done && (
                <div className="flex gap-1 mr-auto">
                  {[0,1,2].map(j => (
                    <div key={j} className="w-1 h-1 rounded-full animate-pulse"
                      style={{ background: "#d4a843", animationDelay: `${j * 200}ms` }} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)", height: 5 }}>
          <div className="progress-bar h-full rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-xs text-center mt-2" style={{ color: "#4a5568" }}>
          {Math.round(progress)}٪ مكتمل
        </p>
      </div>
    </div>
  );
}
