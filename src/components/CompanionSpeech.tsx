import { Character } from "../data/characters";

interface Props {
  character: Character;
  text: string;
}

/**
 * البطل اللي اختاره الطفل يتكلم معه بفقاعة كلام صغيرة (يُستخدم في قصص "موضوع خاص").
 */
export default function CompanionSpeech({ character, text }: Props) {
  return (
    <div className="flex items-end gap-3 mb-4 animate-slide-up">
      <div className="relative shrink-0 flex items-center justify-center" style={{ width: 64, height: 64 }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: `radial-gradient(circle, ${character.color}40, transparent 70%)` }}
        />
        <img
          src={character.image}
          alt={character.name}
          className="animate-idle-bob relative"
          style={{ height: 72, objectFit: "contain", filter: "drop-shadow(0 8px 10px rgba(0,0,0,0.45))" }}
        />
      </div>
      <div
        className="rounded-2xl px-4 py-2.5 text-sm font-semibold leading-relaxed"
        style={{
          background: `${character.color}14`,
          border: `1px solid ${character.color}40`,
          color: "#f0e6c8",
          borderRadius: "18px 18px 4px 18px",
        }}
      >
        <span className="block text-xs mb-0.5" style={{ color: character.color }}>
          {character.name}
        </span>
        {text}
      </div>
    </div>
  );
}

/** وش يقول البطل في كل جزء من القصة */
export function companionLine(
  character: Character,
  storyTitle: string,
  region: string,
  index: number,
  total: number,
): string {
  if (index === 0) {
    return `${character.greeting}. تعال نقرأ قصة «${storyTitle}» مع بعض، وأحداثها في ${region}!`;
  }
  if (index === total - 1) {
    return "وصلنا للخاتمة! ركّز معي في آخر جزء.";
  }
  const middle = [
    "القصة صارت حلوة! خلنا نكمل ونشوف وش بيصير.",
    "انتبه معي، في هذا الجزء معلومة مهمة من الدرس.",
    "أحسنت، أنت قارئ رائع! نكمل؟",
    "باقي شوي ونوصل للنهاية، يلا!",
  ];
  return middle[(index - 1) % middle.length];
}
