import { Story } from "../data/stories";
import Icon, { IconName } from "./Icons";

const nodeTypeIcon: Record<string, IconName> = {
  narrative: "book",
  choice: "sword",
  question: "target",
  puzzle: "puzzle",
  match: "link",
  ending: "trophy",
};

interface Props {
  story: Story;
  currentNodeId: string;
  visitedNodeIds: string[];
  score: number;
  /** قصة "موضوع خاص": نخفي النقاط */
  hideScore?: boolean;
  onClose: () => void;
}

export default function StoryMapPanel({ story, currentNodeId, visitedNodeIds, score, hideScore = false, onClose }: Props) {
  const nodeOrder = buildNodeOrder(story);

  return (
    <div
      className="fixed inset-y-0 left-0 z-40 w-72 flex flex-col"
      style={{
        background: "rgba(9,15,26,0.97)",
        borderRight: "1px solid rgba(212,168,67,0.15)",
        backdropFilter: "blur(16px)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: "1px solid rgba(212,168,67,0.1)" }}>
        <div>
          <p className="text-xs" style={{ color: "#6b7f8e" }}>خريطة القصة</p>
          <p className="font-semibold text-sm" style={{ color: "#f0e6c8" }}>{story.region}</p>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
          style={{ color: "#8fa3b0" }}>×</button>
      </div>

      {/* Score */}
      <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(212,168,67,0.08)" }}>
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: "#6b7f8e" }}>{hideScore ? "تقدّم القراءة" : "النقاط"}</span>
          {!hideScore && (
            <span className="font-bold inline-flex items-center gap-1" style={{ color: "#d4a843" }}>{score} <Icon name="sparkle" size={12} filled /></span>
          )}
        </div>
        <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div className="h-full rounded-full"
            style={{ width: `${Math.min((visitedNodeIds.length / Object.keys(story.nodes).length) * 100, 100)}%`, background: "linear-gradient(90deg, #1a4a3e, #d4a843)" }} />
        </div>
      </div>

      {/* Node list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {nodeOrder.map((nodeId, idx) => {
          const node = story.nodes[nodeId];
          if (!node) return null;
          const visited = visitedNodeIds.includes(nodeId);
          const isCurrent = nodeId === currentNodeId;
          const isLocked = !visited && !isCurrent;

          return (
            <div key={nodeId}
              className="flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all"
              style={{
                background: isCurrent ? "rgba(212,168,67,0.12)" : visited ? "rgba(255,255,255,0.03)" : "transparent",
                border: isCurrent ? "1px solid rgba(212,168,67,0.3)" : "1px solid transparent",
                opacity: isLocked ? 0.35 : 1,
              }}>
              {/* Step number + connector */}
              <div className="flex flex-col items-center shrink-0">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background: isCurrent ? "#d4a843" : visited ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.06)",
                    color: isCurrent ? "#090f1a" : visited ? "#4ade80" : "#6b7f8e",
                    border: visited && !isCurrent ? "1px solid rgba(74,222,128,0.2)" : "none",
                  }}>
                  {visited && !isCurrent ? <Icon name="check" size={12} /> : idx + 1}
                </div>
                {idx < nodeOrder.length - 1 && (
                  <div className="w-px flex-1 mt-1" style={{ minHeight: 12, background: visited ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.06)" }} />
                )}
              </div>

              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="inline-flex" style={{ color: isCurrent ? "#d4a843" : "#8fa3b0" }}>
                    {nodeTypeIcon[node.type] ? <Icon name={nodeTypeIcon[node.type]} size={13} /> : null}
                  </span>
                  <span className="text-xs font-semibold truncate" style={{ color: isCurrent ? "#d4a843" : "#a8b9c8" }}>
                    {node.title ?? node.scene ?? nodeId}
                  </span>
                </div>
                {node.concept && (
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(126,205,184,0.1)", color: "#7ecdb8" }}>
                    {node.concept}
                  </span>
                )}
                {isLocked && (
                  <span className="text-xs inline-flex items-center gap-1" style={{ color: "#4a5568" }}><Icon name="lock" size={10} /> مقفل</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Concepts summary */}
      <div className="px-5 py-4" style={{ borderTop: "1px solid rgba(212,168,67,0.08)" }}>
        <p className="text-xs mb-2.5" style={{ color: "#6b7f8e" }}>المفاهيم في هذه المغامرة</p>
        <div className="flex flex-wrap gap-1.5">
          {story.concepts.map((c) => (
            <span key={c} className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: "rgba(212,168,67,0.1)", color: "#d4a843" }}>{c}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// Build a linear traversal order of nodes from startNode using `next` pointers
function buildNodeOrder(story: Story): string[] {
  const visited = new Set<string>();
  const order: string[] = [];
  const queue = [story.startNode];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id) || !story.nodes[id]) continue;
    visited.add(id);
    order.push(id);
    const node = story.nodes[id];
    if (node.next) queue.push(node.next);
    if (node.choices) {
      node.choices.forEach((c) => { if (c.next && !visited.has(c.next)) queue.push(c.next); });
    }
  }
  return order;
}
