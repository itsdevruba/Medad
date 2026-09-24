import Stars from "./Stars";
import Icon from "./Icons";
import { Story } from "../data/stories";
import { Character } from "../data/characters";

interface Props {
  story: Story;
  character: Character;
  onReadAgain: () => void;
  onNewTopic: () => void;
  onHome: () => void;
}

/**
 * شاشة نهاية قصص "موضوع خاص" المولّدة بعلام.
 * هذي القصص قراءة فقط (بدون أسئلة)، فما نعرض نقاط ولا نجوم ولا إنجازات.
 */
export default function StoryCompleteScreen({ story, character, onReadAgain, onNewTopic, onHome }: Props) {
  return (
    <div className="relative h-full desert-gradient overflow-y-auto">
      <Stars count={80} />

      <div className="relative z-10 max-w-xl mx-auto px-6 py-14 text-center">
        <div className="relative flex justify-center mb-6">
          <div className="absolute rounded-full" style={{ width: 150, height: 150, top: 5,
            background: `radial-gradient(circle, ${character.color}33, transparent 70%)` }} />
          <img src={character.image} alt={character.name} className="animate-idle-bob relative"
            style={{ height: 160, objectFit: "contain", filter: "drop-shadow(0 18px 22px rgba(0,0,0,0.5))" }} />
        </div>

        {/* كلمة البطل */}
        <div className="inline-block rounded-2xl px-5 py-3 mb-6 text-sm font-semibold animate-bubble-in"
          style={{ background: "rgba(17,24,39,0.75)", border: `1px solid ${character.color}45`, color: "#f0e6c8" }}>
          <span className="block text-xs mb-0.5" style={{ color: character.color }}>{character.name}</span>
          استمتعت بالقصة معك! تبي نكتشف موضوعاً جديداً مع بعض؟
        </div>
        <br />

        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold mb-4"
          style={{ background: "rgba(212,168,67,0.12)", border: "1px solid rgba(212,168,67,0.25)", color: "#d4a843" }}>
          <Icon name="book" size={15} /> انتهت القصة
        </div>

        <h1 className="font-display text-4xl mb-3" style={{ color: "#f0e6c8" }}>
          {story.title}
        </h1>
        <p className="text-sm mb-8" style={{ color: "#8fa3b0" }}>
          أحسنت! قرأت القصة كاملة مع {character.name}
        </p>

        {/* معلومات القصة */}
        <div className="card-glass rounded-2xl p-5 mb-8 text-right">
          <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid rgba(212,168,67,0.08)" }}>
            <span className="text-sm inline-flex items-center gap-2" style={{ color: "#d4c89e" }}>
              <Icon name={story.regionIcon} size={15} /> {story.region}
            </span>
            <span className="text-xs" style={{ color: "#6b7f8e" }}>مكان القصة</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm" style={{ color: "#d4c89e" }}>{story.grade}</span>
            <span className="text-xs" style={{ color: "#6b7f8e" }}>الصف الدراسي</span>
          </div>
        </div>

        {/* الأزرار */}
        <div className="flex flex-col gap-3">
          <button onClick={onNewTopic} className="btn-primary px-8 py-4 rounded-xl font-bold inline-flex items-center gap-2 justify-center">
            <Icon name="pencil" size={16} /> اكتب موضوعاً جديداً
          </button>
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={onReadAgain}
              className="flex-1 px-6 py-3.5 rounded-xl font-semibold transition-all hover:bg-white/5 inline-flex items-center gap-2 justify-center"
              style={{ border: "1px solid rgba(212,168,67,0.2)", color: "#a8b9c8" }}>
              <Icon name="undo" size={15} /> اقرأ القصة مرة ثانية
            </button>
            <button onClick={onHome}
              className="flex-1 px-6 py-3.5 rounded-xl font-semibold transition-all hover:bg-white/5 inline-flex items-center gap-2 justify-center"
              style={{ border: "1px solid rgba(212,168,67,0.2)", color: "#a8b9c8" }}>
              <Icon name="home" size={15} /> الرئيسية
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
