import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import closedChest from './assets/treasure_closed.png';
import treasureChest from './assets/treasure_opened.png';
import skeletonChest from './assets/treasure_opened_skeleton.png';
import keyIcon from './assets/key.png';
import chestOpenSound from './audios/chest_open.mp3';
import evilLaughSound from './audios/chest_open_with_evil_laugh.mp3';
import {
  type Player,
  type PlayHistoryEntry,
  NicknameTakenError,
  requestMagicLink,
  onAuthStateChange,
  fetchPlayerProfiles,
  createPlayer,
  renamePlayer,
  fetchPlayCount,
  fetchPlayHistory,
  recordPlay,
  logout,
  getLastActiveProfileId,
  setLastActiveProfileId,
} from './lib/player';
import { isSupabaseConfigured } from './lib/supabase';

type AuthStage = 'loading' | 'enter-email' | 'awaiting-link' | 'choose-nickname' | 'ready';

const chestOpenAudio = new Audio(chestOpenSound);
const evilLaughAudio = new Audio(evilLaughSound);

interface Box {
  id: number;
  isOpen: boolean;
  hasTreasure: boolean;
}

export default function App() {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [score, setScore] = useState(0);
  const [gameEnded, setGameEnded] = useState(false);

  const [authStage, setAuthStage] = useState<AuthStage>('loading');
  const [ownerUid, setOwnerUid] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Player[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [playCount, setPlayCount] = useState(0);
  const [playHistory, setPlayHistory] = useState<PlayHistoryEntry[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [sentToEmail, setSentToEmail] = useState('');
  const [nicknameInput, setNicknameInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [newNicknameInput, setNewNicknameInput] = useState('');
  const [renameInput, setRenameInput] = useState('');
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [profileActionError, setProfileActionError] = useState<string | null>(null);

  const activeProfile = profiles.find(p => p.id === activeProfileId) ?? null;
  const nickname = activeProfile?.nickname ?? null;
  const playerId = activeProfile?.id ?? null;
  const isGameInProgress = boxes.some(box => box.isOpen) && !gameEnded;

  const initializeGame = () => {
    // Randomly assign treasure to one box
    const treasureBoxIndex = Math.floor(Math.random() * 3);
    const newBoxes: Box[] = Array.from({ length: 3 }, (_, index) => ({
      id: index,
      isOpen: false,
      hasTreasure: index === treasureBoxIndex,
    }));
    
    setBoxes(newBoxes);
    setScore(0);
    setGameEnded(false);
  };

  // Initialize game automatically when component mounts
  useEffect(() => {
    initializeGame();
  }, []);

  const loadProfileStats = async (id: string) => {
    const [count, history] = await Promise.all([
      fetchPlayCount(id),
      fetchPlayHistory(id),
    ]);
    setPlayCount(count);
    setPlayHistory(history);
  };

  // Listen for the Supabase session: fires immediately with whatever session
  // already exists (including one just restored from a clicked magic link),
  // then again on every future sign-in/sign-out.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthStage('enter-email');
      return;
    }

    const unsubscribe = onAuthStateChange((uid) => {
      if (!uid) {
        setOwnerUid(null);
        setProfiles([]);
        setActiveProfileId(null);
        setPlayCount(0);
        setPlayHistory([]);
        setAuthStage((prev) => (prev === 'choose-nickname' ? prev : 'enter-email'));
        return;
      }

      setOwnerUid(uid);

      (async () => {
        try {
          const fetchedProfiles = await fetchPlayerProfiles(uid);
          if (fetchedProfiles.length === 0) {
            setProfiles([]);
            setActiveProfileId(null);
            setAuthStage('choose-nickname');
            return;
          }

          setProfiles(fetchedProfiles);
          const storedId = getLastActiveProfileId(uid);
          const matched = storedId ? fetchedProfiles.find(p => p.id === storedId) : undefined;
          const active = matched ?? fetchedProfiles[0];
          setActiveProfileId(active.id);
          await loadProfileStats(active.id);
          setAuthStage('ready');
        } catch (err) {
          console.error('Failed to load player', err);
          setAuthError('登入失敗,請稍後再試');
          setAuthStage('enter-email');
        }
      })();
    });

    return unsubscribe;
  }, []);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = emailInput.trim();
    if (!trimmed) return;

    setAuthError(null);
    try {
      await requestMagicLink(trimmed);
      setSentToEmail(trimmed);
      setAuthStage('awaiting-link');
    } catch (err) {
      console.error('Failed to send magic link', err);
      setAuthError('登入連結寄送失敗,請稍後再試');
    }
  };

  const handleNicknameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nicknameInput.trim();
    if (!trimmed || !ownerUid) return;

    setAuthError(null);
    try {
      const player = await createPlayer(ownerUid, trimmed);
      setProfiles([player]);
      setActiveProfileId(player.id);
      setLastActiveProfileId(ownerUid, player.id);
      setPlayCount(0);
      setPlayHistory([]);
      setAuthStage('ready');
    } catch (err) {
      if (err instanceof NicknameTakenError) {
        setAuthError(err.message);
      } else {
        console.error('Failed to create player', err);
        setAuthError('建立暱稱失敗,請稍後再試');
      }
    }
  };

  const handleSwitchProfile = async (id: string) => {
    if (isGameInProgress || id === activeProfileId || !ownerUid) return;

    setProfileActionError(null);
    setActiveProfileId(id);
    setLastActiveProfileId(ownerUid, id);
    initializeGame();
    try {
      await loadProfileStats(id);
    } catch (err) {
      console.error('Failed to load profile stats', err);
    }
  };

  const handleCreateNickname = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGameInProgress || !ownerUid) return;
    const trimmed = newNicknameInput.trim();
    if (!trimmed) return;

    setProfileActionError(null);
    try {
      const player = await createPlayer(ownerUid, trimmed);
      setProfiles(prev => [...prev, player]);
      setActiveProfileId(player.id);
      setLastActiveProfileId(ownerUid, player.id);
      setNewNicknameInput('');
      initializeGame();
      setPlayCount(0);
      setPlayHistory([]);
    } catch (err) {
      if (err instanceof NicknameTakenError) {
        setProfileActionError(err.message);
      } else {
        console.error('Failed to create nickname', err);
        setProfileActionError('建立暱稱失敗,請稍後再試');
      }
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerId) return;
    const trimmed = renameInput.trim();
    if (!trimmed) return;

    setProfileActionError(null);
    try {
      const updated = await renamePlayer(playerId, trimmed);
      setProfiles(prev => prev.map(p => (p.id === updated.id ? updated : p)));
      setIsEditingNickname(false);
      setRenameInput('');
    } catch (err) {
      if (err instanceof NicknameTakenError) {
        setProfileActionError(err.message);
      } else {
        console.error('Failed to rename player', err);
        setProfileActionError('改暱稱失敗,請稍後再試');
      }
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Failed to logout', err);
    }
    setOwnerUid(null);
    setProfiles([]);
    setActiveProfileId(null);
    setPlayCount(0);
    setPlayHistory([]);
    setEmailInput('');
    setSentToEmail('');
    setNicknameInput('');
    setNewNicknameInput('');
    setRenameInput('');
    setIsEditingNickname(false);
    setProfileActionError(null);
    setAuthError(null);
    setAuthStage('enter-email');
  };

  const openBox = (boxId: number) => {
    if (gameEnded) return;

    let finalScore: number | null = null;

    setBoxes(prevBoxes => {
      const updatedBoxes = prevBoxes.map(box => {
        if (box.id === boxId && !box.isOpen) {
          const newScore = box.hasTreasure ? score + 100 : score - 50;
          finalScore = newScore;
          setScore(newScore);
          const soundToPlay = box.hasTreasure ? chestOpenAudio : evilLaughAudio;
          soundToPlay.currentTime = 0;
          soundToPlay.play();
          return { ...box, isOpen: true };
        }
        return box;
      });

      // Check if treasure is found or all boxes are opened
      const treasureFound = updatedBoxes.some(box => box.isOpen && box.hasTreasure);
      const allOpened = updatedBoxes.every(box => box.isOpen);
      if (treasureFound || allOpened) {
        setGameEnded(true);
        if (playerId && finalScore !== null) {
          recordPlay(playerId, finalScore)
            .then(() => fetchPlayHistory(playerId))
            .then(setPlayHistory)
            .catch(err => console.error('Failed to record play', err));
          setPlayCount(c => c + 1);
        }
      }

      return updatedBoxes;
    });
  };

  const resetGame = () => {
    initializeGame();
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-amber-100 flex items-center justify-center p-8">
        <div className="max-w-md text-center p-6 bg-amber-200/80 backdrop-blur-sm rounded-lg shadow-lg border-2 border-amber-400">
          <h2 className="text-xl mb-2 text-amber-900">需要設定 Supabase</h2>
          <p className="text-amber-800 text-sm">
            請在專案根目錄建立 <code>.env</code> 檔案,並依照 <code>.env.example</code> 填入
            <code> VITE_SUPABASE_URL</code> 與 <code>VITE_SUPABASE_ANON_KEY</code>,然後重新啟動 dev server。
          </p>
        </div>
      </div>
    );
  }

  if (authStage === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-amber-100 flex items-center justify-center p-8">
        <p className="text-amber-800 text-lg">Loading...</p>
      </div>
    );
  }

  if (authStage === 'enter-email' || authStage === 'awaiting-link' || authStage === 'choose-nickname') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-amber-100 flex flex-col items-center justify-center p-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl mb-4 text-amber-900">🏴‍☠️ Treasure Hunt Game 🏴‍☠️</h1>
          <p className="text-amber-800">Login to start playing!</p>
        </div>

        <div className="w-full max-w-sm p-6 bg-amber-200/80 backdrop-blur-sm rounded-lg shadow-lg border-2 border-amber-400">
          {authStage === 'enter-email' && (
            <form onSubmit={handleEmailSubmit} className="flex flex-col gap-2">
              <p className="text-amber-900">Enter your email:</p>
              <Input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="you@example.com"
              />
              <Button type="submit" className="bg-amber-600 hover:bg-amber-700 text-white">
                Send Login Link
              </Button>
            </form>
          )}

          {authStage === 'awaiting-link' && (
            <div className="flex flex-col gap-2 text-center">
              <p className="text-amber-900">
                登入連結已寄到 <strong>{sentToEmail}</strong>,請至信箱點擊連結完成登入。
              </p>
              <p className="text-amber-700 text-sm">完成後這個頁面會自動跳轉,不用手動重新整理。</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAuthStage('enter-email')}
                className="mt-2"
              >
                換一個 email
              </Button>
            </div>
          )}

          {authStage === 'choose-nickname' && (
            <form onSubmit={handleNicknameSubmit} className="flex flex-col gap-2">
              <p className="text-amber-900">Choose a nickname:</p>
              <Input
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                placeholder="Your nickname"
              />
              <Button type="submit" className="bg-amber-600 hover:bg-amber-700 text-white">
                Start Playing
              </Button>
            </form>
          )}

          {authError && (
            <p className="text-red-600 mt-3 text-sm">{authError}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-amber-100 flex flex-col items-center justify-center p-8 relative">
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2 p-3 bg-amber-200/80 backdrop-blur-sm rounded-lg shadow-md border-2 border-amber-400 text-sm">
        <span className="text-amber-900">👤 {nickname}</span>
        <Button type="button" variant="outline" size="sm" onClick={handleLogout}>
          Logout
        </Button>
      </div>

      <div className="text-center mb-8">
        <h1 className="text-4xl mb-4 text-amber-900">🏴‍☠️ Treasure Hunt Game 🏴‍☠️</h1>
        <p className="text-amber-800 mb-4">
          Click on the treasure chests to discover what's inside!
        </p>
        <p className="text-amber-700 text-sm">
          💰 Treasure: +$100 | 💀 Skeleton: -$50
        </p>
      </div>

      <div className="flex flex-wrap items-start justify-center gap-8">
        <aside className="w-64 p-4 bg-amber-200/80 backdrop-blur-sm rounded-lg shadow-lg border-2 border-amber-400">
          <h2 className="text-amber-900 mb-2">遊戲紀錄</h2>
          <div className="max-h-[300px] overflow-y-auto flex flex-col gap-2">
            {playHistory.length === 0 ? (
              <p className="text-amber-700 text-sm">還沒有紀錄</p>
            ) : (
              playHistory.map(entry => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-amber-600/10 text-sm"
                >
                  <span className={entry.score >= 0 ? 'text-green-600' : 'text-red-600'}>
                    ${entry.score}
                  </span>
                  <span className="text-amber-700 text-xs">
                    {new Date(entry.played_at).toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </aside>

        <main className="flex flex-col items-center">
          <div className="mb-8 flex items-center gap-4 flex-wrap justify-center">
            <div className="text-2xl text-center p-4 bg-amber-200/80 backdrop-blur-sm rounded-lg shadow-lg border-2 border-amber-400">
              <span className="text-amber-900">Current Score: </span>
              <span className={`${score >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${score}
              </span>
            </div>

            <div className="text-amber-800 text-sm text-center">
              <p>Plays: {playCount}</p>
            </div>

            {gameEnded && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className={`text-xl px-4 py-2 rounded-lg border-2 ${
                  score > 0
                    ? 'bg-green-100 text-green-800 border-green-300'
                    : score === 0
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-red-100 text-red-800 border-red-300'
                }`}
              >
                {score > 0 ? 'Win!' : score === 0 ? 'Tie' : 'Loss'}
              </motion.div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            {boxes.map((box) => (
              <motion.div
                key={box.id}
                className="flex flex-col items-center"
                style={{ cursor: box.isOpen ? 'default' : `url(${keyIcon}) 16 16, pointer` }}
                whileHover={{ scale: box.isOpen ? 1 : 1.05 }}
                whileTap={{ scale: box.isOpen ? 1 : 0.95 }}
                onClick={() => openBox(box.id)}
              >
                <motion.div
                  initial={{ rotateY: 0 }}
                  animate={{
                    rotateY: box.isOpen ? 180 : 0,
                    scale: box.isOpen ? 1.1 : 1
                  }}
                  transition={{
                    duration: 0.6,
                    ease: "easeInOut"
                  }}
                  className="relative"
                >
                  <img
                    src={box.isOpen
                      ? (box.hasTreasure ? treasureChest : skeletonChest)
                      : closedChest
                    }
                    alt={box.isOpen
                      ? (box.hasTreasure ? "Treasure!" : "Skeleton!")
                      : "Treasure Chest"
                    }
                    className="w-48 h-48 object-contain drop-shadow-lg"
                  />

                  {box.isOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3, duration: 0.5 }}
                      className="absolute -top-8 left-1/2 transform -translate-x-1/2"
                    >
                      {box.hasTreasure ? (
                        <div className="text-2xl animate-bounce">✨💰✨</div>
                      ) : (
                        <div className="text-2xl animate-pulse">💀👻💀</div>
                      )}
                    </motion.div>
                  )}
                </motion.div>

                <div className="mt-4 text-center">
                  {box.isOpen ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.4, duration: 0.3 }}
                      className={`text-lg p-2 rounded-lg ${
                        box.hasTreasure
                          ? 'bg-green-100 text-green-800 border border-green-300'
                          : 'bg-red-100 text-red-800 border border-red-300'
                      }`}
                    >
                      {box.hasTreasure ? '+$100' : '-$50'}
                    </motion.div>
                  ) : (
                    <div className="text-amber-700 p-2">
                      Click to open!
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {gameEnded && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center"
            >
              <div className="mb-4 p-6 bg-amber-200/80 backdrop-blur-sm rounded-xl shadow-lg border-2 border-amber-400">
                <h2 className="text-2xl mb-2 text-amber-900">Game Over!</h2>
                <p className="text-lg text-amber-800">
                  Final Score: <span className={`${score >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${score}
                  </span>
                </p>
                <p className="text-sm text-amber-600 mt-2">
                  {boxes.some(box => box.isOpen && box.hasTreasure)
                    ? 'Treasure found! Well done, treasure hunter! 🎉'
                    : 'No treasure found this time! Better luck next time! 💀'}
                </p>
              </div>

              <Button
                onClick={resetGame}
                className="text-lg px-8 py-4 bg-amber-600 hover:bg-amber-700 text-white"
              >
                Play Again
              </Button>
            </motion.div>
          )}
        </main>

        <aside className="w-64 p-4 bg-amber-200/80 backdrop-blur-sm rounded-lg shadow-lg border-2 border-amber-400">
          <h2 className="text-amber-900 mb-2">暱稱管理</h2>

          {isEditingNickname ? (
            <form onSubmit={handleRenameSubmit} className="flex flex-col gap-2 mb-4">
              <Input
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                placeholder="新暱稱"
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
                  儲存
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsEditingNickname(false);
                    setRenameInput('');
                    setProfileActionError(null);
                  }}
                >
                  取消
                </Button>
              </div>
            </form>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mb-4"
              onClick={() => {
                setIsEditingNickname(true);
                setRenameInput(nickname ?? '');
                setProfileActionError(null);
              }}
            >
              改暱稱
            </Button>
          )}

          <form onSubmit={handleCreateNickname} className="flex flex-col gap-2 mb-2">
            <Input
              value={newNicknameInput}
              onChange={(e) => setNewNicknameInput(e.target.value)}
              placeholder="建立新暱稱"
              disabled={isGameInProgress}
            />
            <Button
              type="submit"
              size="sm"
              disabled={isGameInProgress}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              建立新暱稱
            </Button>
          </form>

          {isGameInProgress && (
            <p className="text-amber-700 text-xs mb-2">
              這局遊戲進行中,無法切換暱稱,請先完成這局或重新開始。
            </p>
          )}

          <div className="max-h-[300px] overflow-y-auto flex flex-col gap-2">
            {profiles.map(profile => (
              <Button
                key={profile.id}
                type="button"
                variant={profile.id === activeProfileId ? 'default' : 'outline'}
                size="sm"
                disabled={isGameInProgress || profile.id === activeProfileId}
                onClick={() => handleSwitchProfile(profile.id)}
                className="justify-start"
              >
                {profile.nickname}
              </Button>
            ))}
          </div>

          {profileActionError && (
            <p className="text-red-600 mt-3 text-sm">{profileActionError}</p>
          )}
        </aside>
      </div>
    </div>
  );
}
