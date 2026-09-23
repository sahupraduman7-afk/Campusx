/**
 * CAMPUSX — STUDY PLANNER & POMODORO TIMER MODULE
 * Local personal productivity task manager and interactive Pomodoro timer.
 */

const PlannerService = {
  STORAGE_KEY: "campusx_study_tasks",
  POMO_STATS_KEY: "campusx_pomodoro_stats",

  // ------------------------------------------------------------------------
  // Task Planner (LocalStorage)
  // ------------------------------------------------------------------------
  getTasks() {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    if (!raw) return [];
    try { return JSON.parse(raw); } catch (e) { return []; }
  },

  saveTasks(tasks) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(tasks));
  },

  addTask({ title, subject, dueDate, priority = "normal" }) {
    if (!title) throw new Error("Task title is required.");
    const tasks = this.getTasks();
    const newTask = {
      id: "task_" + Date.now(),
      title,
      subject: subject || "General Study",
      dueDate: dueDate || new Date().toISOString().split("T")[0],
      priority,
      completed: false,
      createdAt: new Date().toISOString()
    };
    tasks.unshift(newTask);
    this.saveTasks(tasks);
    return newTask;
  },

  toggleTask(taskId) {
    const tasks = this.getTasks();
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      task.completed = !task.completed;
      this.saveTasks(tasks);
    }
    return tasks;
  },

  deleteTask(taskId) {
    let tasks = this.getTasks();
    tasks = tasks.filter(t => t.id !== taskId);
    this.saveTasks(tasks);
    return tasks;
  },

  // ------------------------------------------------------------------------
  // Pomodoro Timer Engine
  // ------------------------------------------------------------------------
  MODES: {
    focus: { label: "Focus Session", duration: 25 * 60 },
    shortBreak: { label: "Short Break", duration: 5 * 60 },
    longBreak: { label: "Long Break", duration: 15 * 60 }
  },

  timerState: {
    mode: "focus",
    secondsRemaining: 25 * 60,
    isRunning: false,
    intervalId: null,
    sessionCount: 0,
    totalMinutesFocused: 0
  },

  initPomodoro({ onTick, onComplete, onModeChange }) {
    // Load persisted stats
    const stats = this.getPomoStats();
    this.timerState.sessionCount = stats.sessionCount || 0;
    this.timerState.totalMinutesFocused = stats.totalMinutesFocused || 0;

    this.onTick = onTick;
    this.onComplete = onComplete;
    this.onModeChange = onModeChange;

    return this.timerState;
  },

  getPomoStats() {
    const raw = localStorage.getItem(this.POMO_STATS_KEY);
    return raw ? JSON.parse(raw) : { sessionCount: 0, totalMinutesFocused: 0 };
  },

  savePomoStats() {
    localStorage.setItem(this.POMO_STATS_KEY, JSON.stringify({
      sessionCount: this.timerState.sessionCount,
      totalMinutesFocused: this.timerState.totalMinutesFocused
    }));
  },

  startTimer() {
    if (this.timerState.isRunning) return;
    this.timerState.isRunning = true;

    this.timerState.intervalId = setInterval(() => {
      this.timerState.secondsRemaining--;
      if (typeof this.onTick === "function") {
        this.onTick(this.formatTime(this.timerState.secondsRemaining), this.timerState);
      }

      if (this.timerState.secondsRemaining <= 0) {
        this.completeSession();
      }
    }, 1000);
  },

  pauseTimer() {
    if (!this.timerState.isRunning) return;
    this.timerState.isRunning = false;
    clearInterval(this.timerState.intervalId);
    this.timerState.intervalId = null;
  },

  resetTimer() {
    this.pauseTimer();
    this.timerState.secondsRemaining = this.MODES[this.timerState.mode].duration;
    if (typeof this.onTick === "function") {
      this.onTick(this.formatTime(this.timerState.secondsRemaining), this.timerState);
    }
  },

  switchMode(newMode) {
    if (!this.MODES[newMode]) return;
    this.pauseTimer();
    this.timerState.mode = newMode;
    this.timerState.secondsRemaining = this.MODES[newMode].duration;
    if (typeof this.onModeChange === "function") {
      this.onModeChange(newMode, this.MODES[newMode]);
    }
    if (typeof this.onTick === "function") {
      this.onTick(this.formatTime(this.timerState.secondsRemaining), this.timerState);
    }
  },

  skipTimer() {
    this.pauseTimer();
    if (this.timerState.mode === "focus") {
      const next = (this.timerState.sessionCount + 1) % 4 === 0 ? "longBreak" : "shortBreak";
      this.switchMode(next);
    } else {
      this.switchMode("focus");
    }
  },

  completeSession() {
    this.pauseTimer();
    this.playChime();

    if (this.timerState.mode === "focus") {
      this.timerState.sessionCount++;
      this.timerState.totalMinutesFocused += 25;
      this.savePomoStats();

      const nextMode = this.timerState.sessionCount % 4 === 0 ? "longBreak" : "shortBreak";
      if (typeof this.onComplete === "function") {
        this.onComplete("Focus session completed! Great job taking a step forward in your learning.", nextMode);
      }
      this.switchMode(nextMode);
    } else {
      if (typeof this.onComplete === "function") {
        this.onComplete("Break is over! Time to get back to studying.", "focus");
      }
      this.switchMode("focus");
    }
  },

  formatTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  },

  // Web Audio API notification sound (Zero external audio assets required!)
  playChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3); // A5

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    } catch (e) {
      console.log("[Audio] Chime skipped:", e);
    }
  }
};

window.PlannerService = PlannerService;
