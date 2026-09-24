import { useState, useEffect } from "react";
import LandingScreen from "./components/LandingScreen";
import DashboardScreen from "./components/DashboardScreen";
import SetupScreen from "./components/SetupScreen";
import CharacterScreen from "./components/CharacterScreen";
import MapScreen from "./components/MapScreen";
import GeneratingScreen from "./components/GeneratingScreen";
import AdventureScreen from "./components/AdventureScreen";
import ResultsScreen from "./components/ResultsScreen";
import StoryCompleteScreen from "./components/StoryCompleteScreen";
import { waterCycleStory, foodChainsStory, subjectPresets, Story } from "./data/stories";
import { warmUpServer } from "./api/storyApi";
import { Character } from "./data/characters";
import {
  PlayerProfile,
  loadProfile,
  saveProfile,
  addAdventureToProfile,
  resetProfile,
} from "./data/progress";

type Screen = "landing" | "dashboard" | "setup" | "character" | "map" | "generating" | "adventure" | "results" | "storyComplete";

interface GameState {
  score: number;
  maxScore: number;
  conceptsMastered: string[];
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [selectedPreset, setSelectedPreset] = useState<(typeof subjectPresets)[0] | undefined>();
  const [lessonInfo, setLessonInfo] = useState({ lesson: "", grade: "", subject: "" });
  const [character, setCharacter] = useState<Character | null>(null);
  const [gameState, setGameState] = useState<GameState>({ score: 0, maxScore: 400, conceptsMastered: [] });
  const [profile, setProfile] = useState<PlayerProfile>(loadProfile);
  // قصة "موضوع خاص" اللي ولّدها نموذج علام من السيرفر
  const [customStory, setCustomStory] = useState<Story | null>(null);
  const isReturningUser = profile.adventures.length > 0;

  // نصحّي سيرفر علام من أول ما يفتح التطبيق، عشان يكون جاهز وقت "موضوع خاص"
  useEffect(() => {
    warmUpServer();
  }, []);

  const activeStory =
    customStory ??
    (selectedPreset?.story === "food-chains-rub-al-khali"
      ? foodChainsStory
      : waterCycleStory);

  const goToSetup = (preset?: (typeof subjectPresets)[0]) => {
    setSelectedPreset(preset);
    setCustomStory(null);
    setScreen("setup");
  };

  const handleEditName = (name: string) => {
    const updated = { ...profile, name };
    setProfile(updated);
    saveProfile(updated);
  };

  const handleResetProfile = () => {
    const fresh = resetProfile();
    setProfile(fresh);
    setCharacter(null);
    setSelectedPreset(undefined);
    setCustomStory(null);
    setGameState({ score: 0, maxScore: 400, conceptsMastered: [] });
    setScreen("landing");
  };

  const handleGenerate = (lesson: string, grade: string, subject: string) => {
    // إذا الدرس من القصص الجاهزة نعرضها، وإلا يصير "موضوع خاص" ونولّده بعلام
    const preset = subjectPresets.find((p) => p.story && p.lesson === lesson.trim());
    setSelectedPreset(preset);
    setCustomStory(null);
    setLessonInfo({ lesson: lesson.trim(), grade, subject });
    setScreen("character");
  };

  const handleCharacterSelect = (char: Character) => {
    setCharacter(char);
    if (selectedPreset?.story) setScreen("map");
    else setScreen("generating");
  };

  const handleAdventureEnd = (score: number, maxScore: number, conceptsMastered: string[]) => {
    // قصص "موضوع خاص" قراءة فقط: ما فيها أسئلة، فما نحسب نقاط ولا إنجازات
    if (customStory) {
      setScreen("storyComplete");
      return;
    }
    setGameState({ score, maxScore, conceptsMastered });
    const pct = Math.round((score / maxScore) * 100);
    const stars = pct >= 85 ? 3 : pct >= 60 ? 2 : 1;
    const updated = addAdventureToProfile(profile, {
      storyId: activeStory.id,
      storyTitle: activeStory.title,
      region: activeStory.region,
      regionIcon: activeStory.regionIcon,
      score,
      maxScore,
      pct,
      stars,
      conceptsMastered,
      characterId: character?.id ?? "explorer",
      characterIcon: character?.icon ?? "compass",
      date: new Date().toLocaleDateString("ar-SA"),
    });
    setProfile(updated);
    setScreen("results");
  };

  return (
    <div className="size-full overflow-hidden">
      {screen === "landing" && (
        <LandingScreen
          onStart={(preset) => {
            if (isReturningUser) {
              setSelectedPreset(preset);
              setScreen(preset ? "setup" : "dashboard");
            } else {
              goToSetup(preset);
            }
          }}
        />
      )}
      {screen === "dashboard" && (
        <DashboardScreen
          profile={profile}
          onStartAdventure={(preset) => goToSetup(preset)}
          onEditName={handleEditName}
          onReset={handleResetProfile}
        />
      )}
      {screen === "setup" && (
        <SetupScreen
          initialPreset={selectedPreset}
          onGenerate={handleGenerate}
          onBack={() => setScreen(isReturningUser ? "dashboard" : "landing")}
        />
      )}
      {screen === "character" && (
        <CharacterScreen
          onSelect={handleCharacterSelect}
          onBack={() => setScreen("setup")}
        />
      )}
      {screen === "map" && character && (
        <MapScreen
          character={character}
          targetStory={activeStory}
          onBegin={() => setScreen("adventure")}
          onBack={() => setScreen("character")}
        />
      )}
      {screen === "generating" && (
        <GeneratingScreen
          lesson={lessonInfo.lesson}
          grade={lessonInfo.grade}
          subject={lessonInfo.subject}
          onComplete={(story) => {
            setCustomStory(story);
            setScreen("adventure");
          }}
          onBack={() => setScreen("setup")}
        />
      )}
      {screen === "adventure" && character && (
        <AdventureScreen
          story={activeStory}
          character={character}
          onEnd={handleAdventureEnd}
          readingMode={customStory !== null}
        />
      )}
      {screen === "storyComplete" && character && customStory && (
        <StoryCompleteScreen
          story={customStory}
          character={character}
          onReadAgain={() => setScreen("adventure")}
          onNewTopic={() => goToSetup()}
          onHome={() => setScreen(isReturningUser ? "dashboard" : "landing")}
        />
      )}
      {screen === "results" && character && (
        <ResultsScreen
          story={activeStory}
          character={character}
          score={gameState.score}
          maxScore={gameState.maxScore}
          conceptsMastered={gameState.conceptsMastered}
          onRestart={() => setScreen("adventure")}
          onHome={() => setScreen("dashboard")}
        />
      )}
    </div>
  );
}
