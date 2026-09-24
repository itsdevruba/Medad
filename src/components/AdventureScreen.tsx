import { useState, useEffect, useRef } from "react";
import Stars from "./Stars";
import MatchPuzzle from "./MatchPuzzle";
import SceneTransition from "./SceneTransition";
import StoryMapPanel from "./StoryMapPanel";
import CharacterCompanion from "./CharacterCompanion";
import CompanionSpeech, { companionLine } from "./CompanionSpeech";
import Icon from "./Icons";
import { Story, StoryNode } from "../data/stories";
import { Character } from "../data/characters";

interface Props {
  story: Story;
  character: Character;
  onEnd: (score: number, maxScore: number, conceptsMastered: string[]) => void;
  /** قصة "موضوع خاص": قراءة فقط — بدون نقاط ولا مفاهيم ولا شاشة نتيجة */
  readingMode?: boolean;
}

const MAX_SCORE = 400;

export default function AdventureScreen({ story, character, onEnd, readingMode = false }: Props) {
  const [nodeId, setNodeId] = useState(story.startNode);
  const [score, setScore] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; correct: boolean } | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [conceptsMastered, setConceptsMastered] = useState<string[]>([]);
  const [visitedNodeIds, setVisitedNodeIds] = useState<string[]>([]);
  const [contentVisible, setContentVisible] = useState(true);
  const [matchDone, setMatchDone] = useState(false);
  const [displayedText, setDisplayedText] = useState("");
  const [mapOpen, setMapOpen] = useState(false);
  const [transitionVisible, setTransitionVisible] = useState(false);
  const [nextNodeId, setNextNodeId] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const typewriterRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const node = story.nodes[nodeId];
  const totalNodes = Object.keys(story.nodes).length;
  const progress = Math.min((visitedNodeIds.length / totalNodes) * 100, 95);

  // Typewriter
  useEffect(() => {
    setDisplayedText("");
    setMatchDone(false);
    const fullText = node.text;
    if (typewriterRef.current) clearTimeout(typewriterRef.current);
    if (node.type === "narrative" || node.type === "ending") {
      let i = 0;
      const tick = () => {
        i++;
        setDisplayedText(fullText.slice(0, i));
        if (i < fullText.length) typewriterRef.current = setTimeout(tick, 16);
      };
      typewriterRef.current = setTimeout(tick, 16);
    } else {
      setDisplayedText(fullText);
    }
    return () => { if (typewriterRef.current) clearTimeout(typewriterRef.current); };
  }, [nodeId]);

  // On node change side effects
  useEffect(() => {
    setSelectedChoice(null);
    setFeedback(null);
    setShowHint(false);
    setHintUsed(false);
    setContentVisible(true);
    setVisitedNodeIds((prev) => prev.includes(nodeId) ? prev : [...prev, nodeId]);
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    if (node?.xp) setScore((prev) => prev + (node.xp ?? 0));
    if (node?.concept && !conceptsMastered.includes(node.concept)) {
      setConceptsMastered((prev) => [...prev, node.concept!]);
    }
  }, [nodeId]);

  const triggerTransition = (nextId: string) => {
    const nextNode = story.nodes[nextId];
    if (nextNode?.scene && nextNode.scene !== node.scene) {
      setNextNodeId(nextId);
      setTransitionVisible(true);
    } else {
      setContentVisible(false);
      setTimeout(() => { setNodeId(nextId); setContentVisible(true); }, 280);
    }
  };

  const handleTransitionDone = () => {
    setTransitionVisible(false);
    if (nextNodeId) {
      setContentVisible(false);
      setTimeout(() => { setNodeId(nextNodeId); setNextNodeId(null); setContentVisible(true); }, 100);
    }
  };

  const handleChoice = (idx: number) => {
    if (selectedChoice !== null) return;
    const choice = node.choices![idx];
    const bonus = character.id === "warrior" ? 20 : 0;
    const pts = (choice.points ?? 0) + (choice.correct ? bonus : 0);
    setSelectedChoice(idx);
    setScore((prev) => prev + pts);
    setFeedback({ text: choice.feedback ?? "", correct: choice.correct ?? false });
    if (choice.correct && node.concept && !conceptsMastered.includes(node.concept)) {
      setConceptsMastered((prev) => [...prev, node.concept!]);
    }
    setTimeout(() => {
      const dest = choice.next ?? node.next;
      if (dest) triggerTransition(dest);
    }, 2600);
  };

  const handleMatchComplete = (_correct: boolean, points: number) => {
    setScore((prev) => prev + points);
    if (node.concept && !conceptsMastered.includes(node.concept)) {
      setConceptsMastered((prev) => [...prev, node.concept!]);
    }
    setMatchDone(true);
  };

  const skipTypewriter = () => {
    if (typewriterRef.current) clearTimeout(typewriterRef.current);
    setDisplayedText(node.text);
  };

  const handleHint = () => {
    setShowHint(true);
    setHintUsed(true);
    if (character.id !== "healer") setScore((prev) => Math.max(0, prev - 5));
  };

  const handleNext = () => {
    if (node.type === "ending") {
      onEnd(score, MAX_SCORE, conceptsMastered);
      return;
    }
    if (node.next) triggerTransition(node.next);
  };

  const renderText = (text: string) =>
    text.split("\n\n").map((para, i) => (
      <p key={i} className={i > 0 ? "mt-4" : ""}>
        {para.split(/\*\*(.*?)\*\*/).map((part, j) =>
          j % 2 === 1 ? <strong key={j} style={{ color: "#d4a843" }}>{part}</strong> : part
        )}
      </p>
    ));

  const typewriterDone = displayedText.length >= node.text.length;
  const letters = ["أ", "ب", "ج", "د"];

  return (
    <>
      <SceneTransition
        scene={story.nodes[nextNodeId ?? nodeId]?.scene ?? ""}
        title={story.nodes[nextNodeId ?? nodeId]?.title ?? ""}
        regionIcon={story.regionIcon}
        visible={transitionVisible}
        onDone={handleTransitionDone}
      />

      {mapOpen && (
        <>
          <div className="fixed inset-0 z-30 bg-black/50" onClick={() => setMapOpen(false)} />
          <StoryMapPanel
            story={story}
            currentNodeId={nodeId}
            visitedNodeIds={visitedNodeIds}
            score={score}
            hideScore={readingMode}
            onClose={() => setMapOpen(false)}
          />
        </>
      )}

      <div className="relative h-screen flex flex-col overflow-hidden" style={{ background: "#090f1a" }}>
        <Stars count={35} />

        {/* ── TOP BAR ── */}
        <header
          className="relative z-20 shrink-0 flex items-center gap-2.5 px-4 py-2.5"
          style={{ borderBottom: "1px solid rgba(212,168,67,0.1)", background: "rgba(9,15,26,0.92)", backdropFilter: "blur(10px)" }}
        >
          {/* Map button */}
          <button
            onClick={() => setMapOpen(true)}
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors hover:bg-white/10"
            style={{ border: "1px solid rgba(212,168,67,0.15)", color: "#8fa3b0" }}
            title="خريطة القصة"
          >
            <Icon name="map" size={16} />
          </button>

          {/* Progress */}
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${progress}%`, background: "linear-gradient(90deg, #1a4a3e, #d4a843)" }}
              />
            </div>
            <span className="text-xs shrink-0 tabular-nums" style={{ color: "#6b7f8e" }}>{Math.round(progress)}٪</span>
          </div>

          {/* Character (in listening/focus mode) + Score */}
          <div className="flex items-center gap-2 shrink-0">
            <CharacterCompanion character={character} variant="listen" size={30} label={character.name} compact />
            {!readingMode && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{ background: "rgba(212,168,67,0.1)", border: "1px solid rgba(212,168,67,0.18)" }}>
                <Icon name="sparkle" size={12} filled className="text-amber-400" />
                <span className="text-xs font-bold tabular-nums" style={{ color: "#d4a843" }}>{score}</span>
              </div>
            )}
          </div>
        </header>

        {/* ── SCENE IMAGE ── */}
        {node.image && (
          <div
            className="relative shrink-0 overflow-hidden"
            style={{
              height: node.type === "narrative" || node.type === "ending" ? 200 : 130,
              opacity: contentVisible ? 1 : 0,
              transition: "opacity 0.3s ease, height 0.4s ease",
            }}
          >
            <img src={node.image} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(9,15,26,0.15) 0%, rgba(9,15,26,0.92) 100%)" }} />
            <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between px-4 pb-3">
              {node.concept && (
                <span className="text-xs px-3 py-1.5 rounded-full font-bold"
                  style={{ background: "rgba(212,168,67,0.88)", color: "#090f1a" }}>
                  {node.concept}
                </span>
              )}
              {node.scene && (
                <span className="text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1"
                  style={{ background: "rgba(9,15,26,0.85)", color: "#d4a843", border: "1px solid rgba(212,168,67,0.25)", backdropFilter: "blur(4px)" }}>
                  <Icon name="pin" size={11} /> {node.scene}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── SCROLL BODY ── */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto relative z-10"
          style={{ opacity: contentVisible ? 1 : 0, transition: "opacity 0.28s ease" }}
        >
          <div className="max-w-2xl mx-auto px-5 py-5 pb-10">

            {/* Title */}
            {node.title && (
              <h2 className="font-display text-2xl md:text-3xl mb-4" style={{ color: "#f0e6c8" }}>
                {node.title}
              </h2>
            )}

            {/* البطل يرافق الطفل في قصص "موضوع خاص" */}
            {readingMode && (
              <CompanionSpeech
                key={nodeId}
                character={character}
                text={companionLine(
                  character,
                  story.title,
                  story.region,
                  Object.keys(story.nodes).indexOf(nodeId),
                  totalNodes,
                )}
              />
            )}

            {/* Narrative bubble */}
            <div
              className="rounded-2xl p-5 mb-5 text-base leading-loose cursor-pointer"
              style={{
                background: "rgba(17,24,39,0.75)",
                border: "1px solid rgba(212,168,67,0.1)",
                color: "#d4c89e",
                fontFamily: "'Cairo', sans-serif",
                lineHeight: 2.15,
              }}
              onClick={!typewriterDone ? skipTypewriter : undefined}
            >
              {renderText(displayedText)}
              {!typewriterDone && (
                <span className="inline-block w-0.5 h-4 bg-amber-400 animate-pulse ml-1 align-middle" />
              )}
            </div>
            {!typewriterDone && (
              <p className="text-xs mb-4 text-center" style={{ color: "#3a4a58" }}>انقر على النص للتخطي</p>
            )}

            {/* ── MATCH PUZZLE ── */}
            {node.type === "match" && node.matchPairs && !matchDone && typewriterDone && (
              <div className="mb-5 animate-slide-up">
                <MatchPuzzle pairs={node.matchPairs} onComplete={handleMatchComplete} />
              </div>
            )}

            {/* ── FEEDBACK ── */}
            {feedback && (
              <div
                className="rounded-xl px-5 py-4 mb-5 text-sm leading-relaxed animate-slide-up"
                style={{
                  background: feedback.correct ? "rgba(22,101,52,0.4)" : "rgba(127,29,29,0.4)",
                  border: `1px solid ${feedback.correct ? "rgba(74,222,128,0.4)" : "rgba(248,113,113,0.4)"}`,
                  color: feedback.correct ? "#86efac" : "#fca5a5",
                }}
              >
                <span className="font-bold ml-2 inline-flex items-center gap-1">
                  <Icon name={feedback.correct ? "check" : "cross"} size={13} />
                  {feedback.correct ? "أحسنت!" : "ليس تماماً —"}
                </span>
                {feedback.text}
              </div>
            )}

            {/* ── CHOICES ── */}
            {(node.type === "choice" || node.type === "question" || node.type === "puzzle") &&
              node.choices && typewriterDone && (
                <div className="space-y-3 mb-5 animate-slide-up">
                  <p className="text-xs font-semibold mb-3 flex items-center gap-1.5" style={{ color: "#6b7f8e" }}>
                    <Icon name={node.type === "question" ? "target" : node.type === "puzzle" ? "puzzle" : "sword"} size={13} />
                    {node.type === "question" ? "اختر الإجابة الصحيحة:" : node.type === "puzzle" ? "ما هو حلك؟" : "ماذا تفعل؟"}
                  </p>
                  {node.choices.map((choice, idx) => {
                    const isThis = selectedChoice === idx;
                    const revealCorrect = selectedChoice !== null && choice.correct;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleChoice(idx)}
                        disabled={selectedChoice !== null}
                        className="w-full px-5 py-4 rounded-xl text-sm text-right flex items-start gap-3 transition-all duration-200 leading-relaxed"
                        style={{
                          background: isThis
                            ? choice.correct ? "rgba(22,101,52,0.55)" : "rgba(127,29,29,0.55)"
                            : revealCorrect ? "rgba(22,101,52,0.3)"
                            : "rgba(26,74,62,0.28)",
                          border: `1px solid ${isThis
                            ? choice.correct ? "rgba(74,222,128,0.5)" : "rgba(248,113,113,0.5)"
                            : revealCorrect ? "rgba(74,222,128,0.3)"
                            : "rgba(126,205,184,0.18)"}`,
                          color: "#d4c89e",
                          opacity: selectedChoice !== null && !isThis && !choice.correct ? 0.4 : 1,
                          cursor: selectedChoice !== null ? "default" : "pointer",
                          transform: selectedChoice === null ? "none" : "none",
                        }}
                      >
                        <span
                          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                          style={{
                            background: isThis
                              ? choice.correct ? "#4ade80" : "#f87171"
                              : revealCorrect ? "#4ade8035"
                              : "rgba(212,168,67,0.14)",
                            color: isThis ? "#090f1a" : "#d4a843",
                          }}
                        >
                          {letters[idx]}
                        </span>
                        <span>{choice.text}</span>
                      </button>
                    );
                  })}
                </div>
              )}

            {/* ── HINT ── */}
            {node.hint && selectedChoice === null && !matchDone &&
              (node.type === "question" || node.type === "puzzle" || node.type === "choice" || node.type === "match") &&
              typewriterDone && (
                <div className="mb-5">
                  {showHint ? (
                    <div className="rounded-xl px-5 py-3 text-sm animate-fade-in leading-relaxed"
                      style={{ background: "rgba(26,74,62,0.3)", border: "1px solid rgba(126,205,184,0.2)", color: "#7ecdb8" }}>
                      <span className="inline-flex items-center gap-1.5"><Icon name="bulb" size={14} /> <strong>تلميح:</strong> {node.hint}</span>
                      {hintUsed && character.id !== "healer" && (
                        <span className="text-xs opacity-50 mr-2">(-٥ نقاط)</span>
                      )}
                    </div>
                  ) : (
                    <button onClick={handleHint} className="text-xs flex items-center gap-2 transition-colors hover:text-teal-400"
                      style={{ color: "#6b7f8e" }}>
                      <Icon name="bulb" size={14} /> أحتاج تلميحاً
                      <span className="opacity-60">{character.id === "healer" ? "(مجاناً)" : "(-٥ نقاط)"}</span>
                    </button>
                  )}
                </div>
              )}

            {/* ── NEXT / CONTINUE ── */}
            {typewriterDone && (
              <>
                {node.type === "narrative" && (
                  <button onClick={handleNext} className="btn-primary px-8 py-4 rounded-xl font-bold inline-flex items-center gap-2">
                    {readingMode ? "الجزء التالي" : "تابع الرحلة"} <Icon name="arrow-left" size={16} />
                  </button>
                )}
                {node.type === "match" && matchDone && (
                  <button onClick={handleNext} className="btn-primary px-8 py-4 rounded-xl font-bold mt-2 animate-slide-up inline-flex items-center gap-2">
                    تابع الرحلة <Icon name="arrow-left" size={16} />
                  </button>
                )}
                {node.type === "ending" && (
                  <div className="space-y-5">
                    <div className="flex items-center gap-3 justify-center py-3">
                      <Icon name="ornament" size={26} className="ornament" />
                      <Icon name="sparkle" size={26} filled className="text-amber-400" />
                      <Icon name="ornament" size={26} className="ornament" />
                    </div>
                    <button onClick={handleNext} className="btn-primary w-full py-5 rounded-2xl text-xl font-black animate-pulse-glow inline-flex items-center justify-center gap-2">
                      {readingMode ? (
                        <>أنهيت القصة <Icon name="check" size={20} /></>
                      ) : (
                        <>اعرض نتيجتي <Icon name="sparkle" size={20} filled /></>
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── BOTTOM CONCEPTS BAR ── */}
        {!readingMode && <div
          className="relative z-20 shrink-0 flex items-center gap-2.5 px-4 py-2 overflow-x-auto"
          style={{ borderTop: "1px solid rgba(212,168,67,0.07)", background: "rgba(9,15,26,0.85)" }}
        >
          <span className="text-xs shrink-0" style={{ color: "#3a4a58" }}>المفاهيم:</span>
          {story.concepts.map((c) => (
            <span key={c}
              className="text-xs px-2.5 py-1 rounded-full shrink-0 transition-all duration-500 inline-flex items-center gap-1"
              style={{
                background: conceptsMastered.includes(c) ? "rgba(22,101,52,0.45)" : "rgba(255,255,255,0.04)",
                color: conceptsMastered.includes(c) ? "#4ade80" : "#3a4a58",
                border: `1px solid ${conceptsMastered.includes(c) ? "rgba(74,222,128,0.25)" : "rgba(255,255,255,0.04)"}`,
              }}>
              {conceptsMastered.includes(c) && <Icon name="check" size={10} />}{c}
            </span>
          ))}
        </div>}
      </div>
    </>
  );
}
