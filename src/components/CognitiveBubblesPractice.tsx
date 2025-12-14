import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, RotateCcw, Play, Pause, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";

// =============================
// Cognitive Bubbles — Practice Game (Single-Operation Expressions)
// =============================
// Keeps all features from the original build:
// - 3 bubbles per set, select ascending, deselect by click
// - Auto-advance after 3 selections or when 10s timer expires
// - 15 sets per run, randomized fresh each run
// - Score, timer bar, results review, keyboard controls
// - Clean UI with Tailwind + shadcn/ui + Framer Motion
// Constraint applied: every arithmetic expression uses at most ONE operation
// (addition, subtraction, multiplication, or division), or a plain integer. No parentheses.
// =============================

interface Bubble {
    id: number;
    display: string;
    value: number;
}

interface Round {
    bubbles: Bubble[];
    correctOrder: number[];
}

interface HistoryEntry {
    roundIndex: number;
    selectedOrder: number[];
    isCorrect: boolean;
    timedOut: boolean;
    timeUsedSec: number;
}

export default function CognitiveBubblesPractice() {
    // Config
    const TOTAL_ROUNDS = 25;
    const ROUND_SECONDS = 10;

    // State
    const [rounds, setRounds] = useState<Round[]>([]);
    const [roundIndex, setRoundIndex] = useState<number>(0);
    const [selected, setSelected] = useState<number[]>([]);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [secondsLeft, setSecondsLeft] = useState<number>(ROUND_SECONDS);
    const [running, setRunning] = useState<boolean>(false);
    const [muted, setMuted] = useState<boolean>(true);
    const [vertical, setVertical] = useState(true);
    const headerRef = useRef<HTMLDivElement | null>(null);
    const [bubblePx, setBubblePx] = useState<number>(160); // default, will be recalculated



    // Sounds (tiny embedded beeps)
    const dingRef = useRef<HTMLAudioElement | null>(null);
    const buzzRef = useRef<HTMLAudioElement | null>(null);
    const timeoutRef = useRef<HTMLAudioElement | null>(null);

    // at top with other refs
    const boardRef = useRef<HTMLDivElement | null>(null);

    // whenever the game starts, bring the board into view
    useEffect(() => {
        if (running && boardRef.current) {
            boardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, [running]);

    useEffect(() => {
        if (!vertical) return; // only apply in vertical layout

        const calc = () => {
            const vh = window.innerHeight;

            // Measure header/toolbars if you have them wrapped in a single container
            const headerH = headerRef.current?.offsetHeight ?? 0;

            // Padding/margins in your board card (adjust if needed)
            const chrome = 48 /* top/btm padding */ + 32 /* title/timer margin */;
            const available = Math.max(0, vh - headerH - chrome);

            // We want: 3 * size + 2 * gap <= available
            const gap = 16; // px (Tailwind gap-4 ≈ 16)
            const maxForHeight = Math.floor((available - 2 * gap) / 3);

            // Also cap by width to avoid bubbles wider than screen
            const vw = window.innerWidth;
            const maxForWidth = Math.floor(Math.min(vw * 0.9, 680) * 0.9); // container width budget

            // Reasonable min/max clamps for aesthetics
            const size = Math.max(96, Math.min(200, Math.min(maxForHeight, maxForWidth)));
            setBubblePx(size);
        };

        calc();
        window.addEventListener("resize", calc);
        return () => window.removeEventListener("resize", calc);
    }, [vertical]);


    useEffect(() => {
        dingRef.current = new Audio(
            "/sounds/correct.mp3"
        );
        buzzRef.current = new Audio(
            "/sounds/wrong.mp3"
        );
        timeoutRef.current = new Audio("/sounds/timeout.mp3");
        dingRef.current.volume = 0.6;
        buzzRef.current.volume = 0.6;
        timeoutRef.current.volume = 0.5;

        dingRef.current.load();
        buzzRef.current.load();
        timeoutRef.current.load();
    }, []);
    // helper functions near your refs
    // put at component scope
    const finalizingRef = useRef(false);

    const stopAllSounds = () => {
        [dingRef, buzzRef, timeoutRef].forEach(r => {
            if (r?.current) {
                r.current.pause();
                r.current.currentTime = 0;
            }
        });
    };

    const playSound = (ref: React.MutableRefObject<HTMLAudioElement | null>) => {
        if (!ref.current) return;
        stopAllSounds();                       // ensure nothing else is playing
        ref.current.currentTime = 0;
        // catch prevents unhandled promise rejection in some browsers
        void ref.current.play().catch(() => { });
    };


    // ---- Utilities ----
    // ===== 1) Level config (easy → medium → hard) =====
    type Op = "+" | "-" | "×" | "÷";

    interface LevelConfig {
        ops: Op[];                 // allowed operators
        min: number;               // min operand (inclusive)
        max: number;               // max operand (inclusive)
        allowZeroForAddition: boolean; // ONLY for Addition in Easy mode
    }

    // roundIndex is 0-based: 0..14 for 15 rounds
    const levelForRound = (roundIndex: number): LevelConfig => {
        if (roundIndex < 10) {
            // EASY: small operands; allow 0 ONLY for Addition
            return { ops: ["+", "-", "×", "÷"], min: 1, max: 9, allowZeroForAddition: true };
        } else if (roundIndex < 18) {
            // MEDIUM
            return { ops: ["+", "-", "×", "÷"], min: 2, max: 20, allowZeroForAddition: false };
        } else {
            // HARD
            return { ops: ["+", "-", "×", "÷"], min: 5, max: 50, allowZeroForAddition: false };
        }
    };

    // ===== helpers =====
    const randInt = (min: number, max: number) =>
        Math.floor(Math.random() * (max - min + 1)) + min;

    const within = (v: number) => v > 0 && v <= 200; // positive-only, cap 200


    // ===== 2) Expression generator: integer-only, positive result, single op, no negatives =====
    // Zero is permitted only for Addition in the EASY level.
    const genExpression = (cfg: LevelConfig): { display: string; value: number } => {
        const op = cfg.ops[randInt(0, cfg.ops.length - 1)];

        const pick = (allowZero = false) => {
            // If zero allowed, expand lower bound to 0; otherwise keep cfg.min
            const lo = allowZero ? Math.min(0, cfg.min) : cfg.min;
            return randInt(lo, cfg.max);
        };

        const finalize = (s: string, v: number) => ({ display: s, value: v });

        // Dynamic, unbiased fallback (fresh valid addition) to avoid scoring bias
        const regenFallback = () => {
            const a = pick(cfg.allowZeroForAddition); // zero allowed only in easy addition
            const b = pick(cfg.allowZeroForAddition);
            const v = a + b;
            return within(v) ? finalize(`${a} + ${b}`, v) : finalize(`1 + 1`, 2);
        };

        for (let tries = 0; tries < 30; tries++) {
            if (op === "+") {
                const a = pick(cfg.allowZeroForAddition);
                const b = pick(cfg.allowZeroForAddition);
                const v = a + b;
                if (within(v)) return finalize(`${a} + ${b}`, v);
            } else if (op === "-") {
                // Strictly positive result: a > b, operands >= 1 (no zero in non-add ops)
                const a = pick(false);
                const b = pick(false);
                if (a > b) {
                    const v = a - b;
                    if (within(v)) return finalize(`${a} - ${b}`, v);
                }
            } else if (op === "×") {
                // Positive operands only; avoid zero products. (No zero in non-add ops)
                const a = pick(false);
                const b = pick(false);
                if (a >= 1 && b >= 1) {
                    const v = a * b;            // integer
                    if (within(v)) return finalize(`${a} × ${b}`, v);
                }
            } else { // "÷"
                // Exact integer division: a = b * k (all positive)
                const b = pick(false);         // b >= 1
                const maxK = Math.min(200, Math.floor(cfg.max / Math.max(1, b))); // ensure a <= cfg.max and v <= 200
                const minK = Math.max(1, Math.ceil(cfg.min / Math.max(1, b)));
                if (maxK >= minK) {
                    const k = randInt(minK, Math.max(minK, maxK));
                    const a = b * k;
                    const v = a / b;             // integer == k
                    if (a >= cfg.min && a <= cfg.max && within(v)) {
                        return finalize(`${a} ÷ ${b}`, v);
                    }
                }
            }
        }

        // Fallback: fresh random valid addition respecting the easy-mode zero exception
        return regenFallback();
    };


    // ===== 3) Unique triplet using integer equality (no decimals needed) =====
    const uniqueTriplet = (cfg: LevelConfig) => {
        const out: { display: string; value: number }[] = [];
        const seen = new Set<number>(); // unique integer results
        while (out.length < 3) {
            const e = genExpression(cfg);
            if (Number.isFinite(e.value) && e.value > 0 && !seen.has(e.value)) {
                out.push(e);
                seen.add(e.value);
            }
        }
        return out;
    };


    // ===== 4) Bootstrap: compute level per round and build items =====
    const bootstrap = () => {
        const rs: any[] = [];
        for (let i = 0; i < TOTAL_ROUNDS; i++) {
            const cfg = levelForRound(i);
            const triplet = uniqueTriplet(cfg).map((t, idx) => ({
                id: idx,
                display: t.display,
                value: t.value
            }));
            const order = [...triplet].sort((a, b) => a.value - b.value).map(b => b.id);
            rs.push({ bubbles: triplet, correctOrder: order });
        }
        setRounds(rs);
        setRoundIndex(0);
        setSelected([]);
        setHistory([]);
        setSecondsLeft(ROUND_SECONDS);
        setRunning(false);
    };


    useEffect(() => { bootstrap(); }, []);

    // Timer
    useEffect(() => {
        if (!running) return;
        if (roundIndex >= TOTAL_ROUNDS) return;
        if (secondsLeft <= 0) {
            finalizeRound(true);
            return;
        }
        const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
        return () => clearTimeout(t);
    }, [running, roundIndex, secondsLeft]);

    const current: Round | undefined = rounds[roundIndex];

    const finalizeRound = (timedOut: boolean = false): void => {
        if (finalizingRef.current) return;      // prevent duplicate plays / state
        finalizingRef.current = true;
        const isCorrect =
            !timedOut &&
            selected.length === 3 &&
            current.correctOrder.every((id: number, i: number) => id === selected[i]);

        // NEW: seconds actually used this round
        const timeUsed = Math.min(ROUND_SECONDS, Math.max(0, ROUND_SECONDS - secondsLeft));

        // Store timeUsed in history
        setHistory((h) => [
            ...h,
            { roundIndex, selectedOrder: selected, isCorrect, timedOut, timeUsedSec: timeUsed }
        ]);

        if (!muted) {
            if (timedOut) {
                playSound(timeoutRef);
            } else if (isCorrect) {
                playSound(dingRef);
            } else {
                playSound(buzzRef);
            }
        }


        const next = roundIndex + 1;
        // Always advance the roundIndex so that when next === TOTAL_ROUNDS
        // `current` becomes undefined and the Completed UI (final score) renders.
        setRoundIndex(next);
        if (next < TOTAL_ROUNDS) {
            setSelected([]);
            setSecondsLeft(ROUND_SECONDS);
        } else {
            // completed run
            setSelected([]);
            setSecondsLeft(0);
            setRunning(false);
        }
        // release guard after state queue flushes
        setTimeout(() => { finalizingRef.current = false; }, 0);
    };

    // Auto-advance when 3 picks done
    useEffect(() => {
        if (!running) return;
        if (selected.length === 3) finalizeRound(false);
    }, [selected, running]);

    const togglePick = (id: number): void => {
        if (!running) return;
        if (selected.includes(id)) {
            setSelected((prev) => prev.filter((x) => x !== id));
            return;
        }
        if (selected.length < 3) setSelected((prev) => [...prev, id]);
    };

    // Keyboard controls: 1/2/3 select, R restart, Space pause/resume
    useEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "1" || e.key === "2" || e.key === "3") {
                const id = Number(e.key) - 1;
                togglePick(id);
            } else if (e.key.toLowerCase() === "r") {
                e.preventDefault();
                bootstrap();
            } else if (e.key === " ") {
                e.preventDefault();
                setRunning((r) => !r);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);


    const score = useMemo(() => history.filter((h) => h.isCorrect).length, [history]);
    const incorrect = useMemo(() => history.filter((h) => !h.isCorrect && !h.timedOut).length, [history]);
    const timeouts = useMemo(() => history.filter((h) => h.timedOut).length, [history]);
    const accuracy = useMemo(() => (TOTAL_ROUNDS ? Math.round((score / TOTAL_ROUNDS) * 100) : 0), [score]);
    const isFinished = roundIndex >= TOTAL_ROUNDS;
    const pct = useMemo(() => (secondsLeft / ROUND_SECONDS) * 100, [secondsLeft]);
    const totalTimeUsedSec = useMemo(
        () => history.reduce((sum, h) => sum + (h.timeUsedSec ?? 0), 0),
        [history]
    );
    const totalTimeAvailableSec = TOTAL_ROUNDS * ROUND_SECONDS;

    const formatTime = (s: number) =>
        `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;


    return (
        <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900 p-6">
            <div className="mx-auto max-w-5xl">
                <header ref={headerRef} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Cognitive Bubbles — Practice</h1>
                        <p className="text-sm text-slate-600">Select the bubbles from lowest to highest value. Each expression has a single arithmetic operation (or a single number). 10 seconds per set. 15 sets per run.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant={running ? "secondary" : "default"} onClick={() => setRunning((r) => !r)} className="rounded-2xl">
                            {running ? (
                                <><Pause className="w-4 h-4 mr-2" />Pause</>
                            ) : (
                                <><Play className="w-4 h-4 mr-2" />Start</>
                            )}
                        </Button>
                        <Button variant="outline" onClick={bootstrap} className="rounded-2xl"><RotateCcw className="w-4 h-4 mr-2" />Restart</Button>
                        <Button variant="outline" onClick={() => setVertical(v => !v)} className="rounded-2xl">
                            {vertical ? "Horizontal" : "Vertical"} layout
                        </Button>
                        <Button variant="ghost" onClick={() => setMuted((m) => !m)} className="rounded-2xl" title={muted ? "Unmute" : "Mute"}>
                            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        </Button>

                    </div>
                </header>

                {/* Progress & Meta */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                    <div className="lg:col-span-2 bg-white rounded-2xl shadow p-4">
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-medium">Set {Math.min(roundIndex + 1, TOTAL_ROUNDS)} / {TOTAL_ROUNDS}</div>

                        </div>
                        <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={ROUND_SECONDS} aria-valuenow={secondsLeft}>
                            <div className={`h-full ${secondsLeft <= 3 ? "bg-red-500" : secondsLeft <= 6 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="mt-2 text-xs text-slate-600">Time left: <span className={`font-semibold ${secondsLeft <= 3 ? "text-red-600" : ""}`}>{secondsLeft}s</span></div>
                    </div>

                    <div className="bg-white rounded-2xl shadow p-4">
                        <div className="text-sm font-medium mb-2">How to play</div>
                        <ul className="text-sm text-slate-600 list-disc list-inside space-y-1">
                            <li>Click bubbles in ascending order. Click again to deselect.</li>
                            <li>Auto-advance after 3 picks or when time expires.</li>
                            <li>Keyboard: 1/2/3 to pick, Space to pause/resume, R to restart.</li>
                        </ul>
                    </div>
                </div>

                {/* Game board */}
                <div ref={boardRef} className="bg-white rounded-3xl shadow-lg p-6 mb-6" style={vertical ? { minHeight: `calc(100vh - ${(headerRef.current?.offsetHeight ?? 0) + 48}px)` } : {}}>
                    {!current ? (
                        <div className="text-center py-16">
                            <div className="text-xl">Completed. Final Score: <span className="font-semibold">{score} / {TOTAL_ROUNDS}</span></div>
                            <div className="mt-2 text-sm text-slate-600">Accuracy: {accuracy}% · Incorrect: {incorrect} · Timed out: {timeouts}</div>
                            <div className="mt-1 text-sm text-slate-600">Time used: {formatTime(totalTimeUsedSec)} / {formatTime(totalTimeAvailableSec)}</div>
                            <div className="mt-4 flex items-center justify-center gap-3">
                                <Button onClick={bootstrap} className="rounded-2xl"><RotateCcw className="w-4 h-4 mr-2" />Play Again</Button>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div className="text-center text-slate-700 mb-4">
                                Select from lowest to highest value {vertical ? "(top to bottom)" : ""}
                            </div>

                            <div
                                // Containers are strictly separated so styles don't bleed across
                                className={
                                    vertical
                                        ? "flex flex-col justify-between w-full max-w-[520px] mx-auto"
                                        : "grid grid-cols-1 sm:grid-cols-3 gap-6 place-items-center"
                                }
                                // Only vertical gets 100% height (so all 3 fit with no scroll)
                                style={vertical ? { height: "100%" } : undefined}
                            >
                                {current.bubbles.map((b, i) => {
                                    const rank = selected.indexOf(b.id);
                                    const isPicked = rank >= 0;

                                    // Zig-zag only for vertical (removed for horizontal)
                                    const staggerClass = vertical
                                        ? i % 2 === 0
                                            ? "self-center md:self-start md:ml-4"
                                            : "self-center md:self-end md:mr-4"
                                        : "";

                                    // Horizontal → original fixed sizes
                                    // Vertical → dynamic bubblePx (no inline width/height if horizontal)
                                    const sizeClassesHorizontal =
                                        "w-48 h-48 sm:w-44 sm:h-44 md:w-56 md:h-56";
                                    return (
                                        <motion.button
                                            key={b.id}
                                            layout
                                            onClick={() => togglePick(b.id)}
                                            initial={
                                                vertical ? { opacity: 0, x: i % 2 === 0 ? -16 : 16 } : { opacity: 0 }
                                            }
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ duration: 0.18 }}
                                            className={`${staggerClass} relative rounded-full flex items-center justify-center select-none shadow-lg border transition-all ${isPicked ? "scale-95 border-emerald-500" : "border-transparent"
                                                } ${running ? "cursor-pointer" : "cursor-not-allowed opacity-60"} ${vertical ? "" : sizeClassesHorizontal
                                                }`}
                                            style={
                                                vertical
                                                    ? {
                                                        width: bubblePx,   // ONLY in vertical
                                                        height: bubblePx,  // ONLY in vertical
                                                        background:
                                                            "radial-gradient(circle at 30% 30%, rgba(16,185,129,0.15), rgba(59,130,246,0.15))",
                                                    }
                                                    : {
                                                        background:
                                                            "radial-gradient(circle at 30% 30%, rgba(16,185,129,0.15), rgba(59,130,246,0.15))",
                                                    }
                                            }
                                            aria-pressed={isPicked}
                                        >
                                            <div
                                                className={`font-semibold text-slate-900 ${vertical ? "text-lg md:text-xl" : "text-2xl md:text-3xl"
                                                    }`}
                                            >
                                                {b.display}
                                            </div>

                                            <AnimatePresence>
                                                {isPicked && (
                                                    <motion.div
                                                        initial={{ opacity: 0, scale: 0.8 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        exit={{ opacity: 0, scale: 0.8 }}
                                                        className="absolute -top-2 -right-2 bg-emerald-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shadow"
                                                        title={`Pick #${rank + 1}`}
                                                    >
                                                        {rank + 1}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </motion.button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Post-run Summary (for review) */}
                {isFinished && (
                    <div className="bg-white rounded-2xl shadow p-4 mb-6">
                        <div className="text-sm font-medium mb-2">Post‑Run Summary</div>
                        <div className="flex flex-wrap items-center gap-4 text-sm">
                            <div><span className="font-semibold">Final Score:</span> {score} / {TOTAL_ROUNDS}</div>
                            <div><span className="font-semibold">Accuracy:</span> {accuracy}%</div>
                            <div><span className="font-semibold">Incorrect:</span> {incorrect}</div>
                            <div><span className="font-semibold">Timed out:</span> {timeouts}</div>
                            <div><span className="font-semibold">Time used:</span> {formatTime(totalTimeUsedSec)} / {formatTime(totalTimeAvailableSec)}</div>
                        </div>
                    </div>
                )}

                {/* Review / Results */}
                {isFinished && (
                    <div className="bg-white rounded-2xl shadow p-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="text-sm font-medium">Results</div>
                            <div className="text-sm text-slate-600">Correct: <span className="font-semibold">{score}</span> / {history.length}</div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {history.map((h, i) => {
                                const r = rounds[h.roundIndex];
                                const label = h.isCorrect ? "Correct" : h.timedOut ? "Timed out" : "Incorrect";
                                return (
                                    <div key={i} className="border rounded-xl p-3">
                                        <div className="flex items-center justify-between text-sm mb-1">
                                            <div className="font-medium">Set {h.roundIndex + 1}</div>
                                            <div className={`flex items-center gap-1 ${h.isCorrect ? "text-emerald-600" : h.timedOut ? "text-amber-600" : "text-rose-600"}`}>
                                                {h.isCorrect ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                                                <span>{label}</span>
                                            </div>
                                        </div>
                                        <div className="text-xs text-slate-600">Correct order:</div>
                                        <div className="text-sm">{r.correctOrder.map((id) => r.bubbles[id].display).join("  <  ")}</div>
                                        <div className="text-xs text-slate-600 mt-2">Your picks:</div>
                                        <div className="text-sm">{h.selectedOrder.length ? h.selectedOrder.map((id) => r.bubbles[id].display).join("  <  ") : "—"}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Hidden audio elements */}
            <audio ref={dingRef} hidden />
            <audio ref={buzzRef} hidden />

            {/* Screen reader tick when time hits zero */}
            {running && secondsLeft === 0 && (
                <div className="sr-only">Time over</div>
            )}
        </div>
    );
}
