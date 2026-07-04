"use strict";

const DATA_URL = "data/questions.json";
const PROFILE_KEY = "memuro-tanken-profile-v2";
const SESSION_KEY = "memuro-tanken-session-v2";

const elements = {
  loadingMessage: document.querySelector("#loadingMessage"),
  homeScreen: document.querySelector("#homeScreen"),
  quizScreen: document.querySelector("#quizScreen"),
  resultScreen: document.querySelector("#resultScreen"),
  errorScreen: document.querySelector("#errorScreen"),
  courseGrid: document.querySelector("#courseGrid"),
  badgeCount: document.querySelector("#badgeCount"),
  correctTotal: document.querySelector("#correctTotal"),
  resumeArea: document.querySelector("#resumeArea"),
  resumeText: document.querySelector("#resumeText"),
  resumeButton: document.querySelector("#resumeButton"),
  questionCounter: document.querySelector("#questionCounter"),
  scoreChip: document.querySelector("#scoreChip"),
  progressTrack: document.querySelector(".progress-track"),
  progressBar: document.querySelector("#progressBar"),
  courseLabel: document.querySelector("#courseLabel"),
  questionText: document.querySelector("#questionText"),
  choiceList: document.querySelector("#choiceList"),
  feedback: document.querySelector("#feedback"),
  feedbackMascot: document.querySelector("#feedbackMascot"),
  feedbackTitle: document.querySelector("#feedbackTitle"),
  feedbackAnswer: document.querySelector("#feedbackAnswer"),
  feedbackText: document.querySelector("#feedbackText"),
  sourceText: document.querySelector("#sourceText"),
  nextButton: document.querySelector("#nextButton"),
  resultKicker: document.querySelector("#resultKicker"),
  resultTitle: document.querySelector("#resultTitle"),
  resultScore: document.querySelector("#resultScore"),
  resultTotal: document.querySelector("#resultTotal"),
  starRow: document.querySelector("#starRow"),
  resultSummary: document.querySelector("#resultSummary"),
  discoveryList: document.querySelector("#discoveryList"),
  reviewButton: document.querySelector("#reviewButton"),
  teacherPanel: document.querySelector("#teacherPanel"),
  teacherSummary: document.querySelector("#teacherSummary"),
  teacherWarnings: document.querySelector("#teacherWarnings"),
  soundButton: document.querySelector("#soundButton"),
  errorMessage: document.querySelector("#errorMessage")
};

let quizData = null;
let questionMap = new Map();
let profile = loadJson(PROFILE_KEY, createDefaultProfile());
let state = createEmptyState();
let audioContext = null;

function createDefaultProfile() {
  return {
    totalPlays: 0,
    badges: 0,
    correctAnswers: 0,
    totalAnswers: 0,
    sound: false,
    recentByCourse: {},
    courseStats: {}
  };
}

function createEmptyState() {
  return {
    courseId: null,
    queueIds: [],
    index: 0,
    score: 0,
    wrongIds: [],
    answers: [],
    currentChoices: [],
    locked: false,
    mode: "normal",
    resultSaved: false
  };
}

function loadJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value && typeof value === "object" ? { ...fallback, ...value } : fallback;
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
}

function saveProfile() {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  updateHomeRecords();
}

function saveSession() {
  const saved = {
    courseId: state.courseId,
    queueIds: state.queueIds,
    index: state.index,
    score: state.score,
    wrongIds: state.wrongIds,
    answers: state.answers,
    mode: state.mode
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(saved));
  updateResumeCard();
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  updateResumeCard();
}

function validateData(data) {
  const errors = [];
  const warnings = [];
  const courseIds = new Set((data.courses || []).map((course) => course.id));
  const ids = new Set();

  if (!Array.isArray(data.courses) || data.courses.length === 0) errors.push("コースがありません。");
  if (!Array.isArray(data.questions) || data.questions.length === 0) errors.push("問題がありません。");

  (data.questions || []).forEach((item, index) => {
    const label = item.id || `${index + 1}番目`;
    if (!item.id || ids.has(item.id)) errors.push(`問題ID「${label}」が重複または未入力です。`);
    ids.add(item.id);
    if (!courseIds.has(item.course)) errors.push(`問題「${label}」のcourseが不正です。`);
    if (!item.question || !item.explanation) errors.push(`問題「${label}」の本文または解説がありません。`);
    if (!Array.isArray(item.choices) || item.choices.length !== 3) errors.push(`問題「${label}」の選択肢は3つ必要です。`);
    if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer >= (item.choices || []).length) {
      errors.push(`問題「${label}」のanswerが範囲外です。`);
    }
    if (!item.source) warnings.push(`問題「${label}」に出典がありません。`);
  });

  (data.courses || []).forEach((course) => {
    const count = (data.questions || []).filter((item) => item.course === course.id).length;
    if (count < data.sessionSize) warnings.push(`「${course.title}」は${data.sessionSize}問未満です。`);
  });

  return { errors, warnings };
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

function pickQuestionIds(courseId) {
  const all = quizData.questions.filter((item) => item.course === courseId);
  const recent = new Set(profile.recentByCourse[courseId] || []);
  const fresh = shuffle(all.filter((item) => !recent.has(item.id)));
  const seen = shuffle(all.filter((item) => recent.has(item.id)));
  return [...fresh, ...seen].slice(0, quizData.sessionSize).map((item) => item.id);
}

function getCourse(courseId) {
  return quizData.courses.find((course) => course.id === courseId);
}

function showScreen(screenName) {
  ["homeScreen", "quizScreen", "resultScreen", "errorScreen"].forEach((name) => {
    elements[name].hidden = name !== screenName;
  });
  window.scrollTo({ top: 0, behavior: "auto" });
  document.querySelector("#main").focus({ preventScroll: true });
}

function buildCourseCards() {
  elements.courseGrid.replaceChildren(...quizData.courses.map((course, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "course-card";
    button.dataset.course = course.id;
    button.setAttribute("aria-label", `${course.title}、${course.level}、5問をはじめる`);

    const content = document.createElement("span");
    const number = document.createElement("span");
    number.className = "course-number";
    number.textContent = `COURSE ${index + 1}・${course.level}`;
    const title = document.createElement("strong");
    title.textContent = course.title;
    const description = document.createElement("small");
    description.textContent = course.description;
    content.append(number, title, description);

    const icon = document.createElement("span");
    icon.className = "course-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = course.icon;
    const play = document.createElement("span");
    play.className = "course-play";
    play.setAttribute("aria-hidden", "true");
    play.textContent = "▶";
    button.append(content, icon, play);
    button.addEventListener("click", () => startSession(course.id));
    return button;
  }));
}

function updateHomeRecords() {
  elements.badgeCount.textContent = profile.badges;
  elements.correctTotal.textContent = profile.correctAnswers;
}

function getSavedSession() {
  const saved = loadJson(SESSION_KEY, null);
  if (!saved || !getCourse(saved.courseId) || !Array.isArray(saved.queueIds)) return null;
  if (saved.index >= saved.queueIds.length || saved.queueIds.some((id) => !questionMap.has(id))) return null;
  return saved;
}

function updateResumeCard() {
  if (!quizData) return;
  const saved = getSavedSession();
  elements.resumeArea.hidden = !saved;
  if (saved) {
    const course = getCourse(saved.courseId);
    elements.resumeText.textContent = `${course.title}　${saved.index + 1}もんめから`;
  }
}

function startSession(courseId, queueIds = null, mode = "normal") {
  state = {
    ...createEmptyState(),
    courseId,
    queueIds: queueIds || pickQuestionIds(courseId),
    mode
  };
  showScreen("quizScreen");
  renderQuestion();
  saveSession();
}

function resumeSession() {
  const saved = getSavedSession();
  if (!saved) return;
  state = { ...createEmptyState(), ...saved };
  showScreen("quizScreen");
  renderQuestion();
}

function renderQuestion() {
  const item = questionMap.get(state.queueIds[state.index]);
  const course = getCourse(state.courseId);
  const total = state.queueIds.length;

  state.locked = false;
  state.currentChoices = shuffle(item.choices.map((text, originalIndex) => ({ text, originalIndex })));
  elements.feedback.hidden = true;
  elements.questionCounter.textContent = `${state.index + 1} / ${total}`;
  elements.scoreChip.textContent = `⭐ ${state.score}`;
  elements.progressTrack.setAttribute("aria-valuemax", total);
  elements.progressTrack.setAttribute("aria-valuenow", state.index + 1);
  elements.progressBar.style.width = `${((state.index + 1) / total) * 100}%`;
  elements.courseLabel.textContent = `${course.icon} ${course.title}${state.mode === "review" ? "・ふくしゅう" : ""}`;
  elements.questionText.textContent = item.question;

  elements.choiceList.replaceChildren(...state.currentChoices.map((choice, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button";
    button.dataset.choiceIndex = index;
    button.setAttribute("aria-label", `${index + 1}、${choice.text}`);

    const number = document.createElement("span");
    number.className = "choice-number";
    number.setAttribute("aria-hidden", "true");
    number.textContent = index + 1;
    const text = document.createElement("span");
    text.textContent = choice.text;
    button.append(number, text);
    button.addEventListener("click", () => chooseAnswer(index));
    return button;
  }));

  const firstChoice = elements.choiceList.querySelector("button");
  if (firstChoice) firstChoice.focus();
}

function chooseAnswer(selectedIndex) {
  if (state.locked) return;
  state.locked = true;
  const item = questionMap.get(state.queueIds[state.index]);
  const selected = state.currentChoices[selectedIndex];
  const correct = selected.originalIndex === item.answer;
  const buttons = [...elements.choiceList.querySelectorAll(".choice-button")];

  buttons.forEach((button, index) => {
    button.disabled = true;
    if (state.currentChoices[index].originalIndex === item.answer) button.classList.add("correct");
    if (index === selectedIndex && !correct) button.classList.add("wrong");
  });

  state.answers.push({ id: item.id, correct });
  if (correct) {
    state.score += 1;
    elements.feedbackTitle.textContent = ["やったね！", "はっけん できた！", "そのちょうし！"][state.index % 3];
    elements.feedbackAnswer.textContent = "";
    elements.feedbackMascot.src = "images/machiru-wave.svg";
    playTone(660);
  } else {
    state.wrongIds.push(item.id);
    elements.feedbackTitle.textContent = "おしい！ ひとつ はっけん";
    elements.feedbackAnswer.textContent = `こたえ：${item.choices[item.answer]}`;
    elements.feedbackMascot.src = "images/machiru-front.svg";
    playTone(330);
  }

  elements.scoreChip.textContent = `⭐ ${state.score}`;
  elements.feedbackText.textContent = item.explanation;
  elements.sourceText.textContent = item.source;
  elements.nextButton.textContent = state.index + 1 === state.queueIds.length ? "けっかを みる →" : "つぎへ →";
  elements.feedback.hidden = false;
  elements.nextButton.focus();
}

function nextQuestion() {
  if (!state.locked) return;
  state.index += 1;
  if (state.index < state.queueIds.length) {
    renderQuestion();
    saveSession();
  } else {
    showResult();
  }
}

function showResult() {
  const course = getCourse(state.courseId);
  const total = state.queueIds.length;

  if (!state.resultSaved) {
    profile.totalPlays += 1;
    profile.badges += 1;
    profile.correctAnswers += state.score;
    profile.totalAnswers += total;
    profile.recentByCourse[state.courseId] = state.queueIds;
    const oldStats = profile.courseStats[state.courseId] || { plays: 0, best: 0 };
    profile.courseStats[state.courseId] = {
      plays: oldStats.plays + 1,
      best: Math.max(oldStats.best, state.score)
    };
    state.resultSaved = true;
    saveProfile();
    clearSession();
  }

  elements.resultKicker.textContent = `${course.icon} ${course.title}`;
  elements.resultScore.textContent = state.score;
  elements.resultTotal.textContent = `/ ${total}`;
  elements.starRow.textContent = `${"⭐".repeat(state.score)}${"☆".repeat(total - state.score)}`;
  elements.resultTitle.textContent = state.score === total ? "たんけん名人！" : "たんけん おわり！";
  if (state.score === total) {
    elements.resultSummary.textContent = `${total}もん ぜんぶ はっけん！ ちがう問題にも ちょうせんしよう。`;
  } else if (state.score >= Math.ceil(total / 2)) {
    elements.resultSummary.textContent = "いい たんけんだったね。まちがいは、新しい はっけん！";
  } else {
    elements.resultSummary.textContent = "さいごまで できたね。もう1回で、もっと はっけんできるよ。";
  }

  const answerChips = state.queueIds.map((id) => {
    const item = questionMap.get(id);
    const chip = document.createElement("span");
    chip.textContent = item.choices[item.answer];
    return chip;
  });
  elements.discoveryList.replaceChildren(...answerChips);

  const uniqueWrong = [...new Set(state.wrongIds)];
  elements.reviewButton.hidden = uniqueWrong.length === 0;
  elements.reviewButton.textContent = `まちがい ${uniqueWrong.length}もん ふくしゅう`;
  elements.reviewButton.onclick = () => startSession(state.courseId, uniqueWrong, "review");
  showScreen("resultScreen");
  playTone(state.score === total ? 880 : 520);
}

function goHome() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  showScreen("homeScreen");
  updateHomeRecords();
  updateResumeCard();
}

function quitQuiz() {
  if (state.locked) {
    state.index += 1;
    state.locked = false;
    if (state.index >= state.queueIds.length) {
      showResult();
      return;
    }
  }
  saveSession();
  goHome();
}

function playTone(frequency) {
  if (!profile.sound) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  audioContext ||= new AudioContextClass();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.035, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.13);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.13);
}

function updateSoundButton() {
  elements.soundButton.setAttribute("aria-pressed", String(profile.sound));
  elements.soundButton.setAttribute("aria-label", profile.sound ? "こうかおんを きる" : "こうかおんを つける");
  elements.soundButton.querySelector(".sound-label").textContent = profile.sound ? "おと ON" : "おと OFF";
}

function readCurrentQuestion() {
  if (!("speechSynthesis" in window) || elements.quizScreen.hidden) return;
  const item = questionMap.get(state.queueIds[state.index]);
  const text = `${item.question}。${state.currentChoices.map((choice, index) => `${index + 1}、${choice.text}`).join("。")}`;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = 0.88;
  window.speechSynthesis.speak(utterance);
}

function showTeacherCheck(report) {
  const query = new URLSearchParams(location.search);
  if (query.get("teacher") !== "1") return;
  elements.teacherPanel.hidden = false;
  const counts = quizData.courses.map((course) => {
    const count = quizData.questions.filter((item) => item.course === course.id).length;
    return `${course.title} ${count}問`;
  });
  elements.teacherSummary.textContent = `全${quizData.questions.length}問：${counts.join("／")}`;
  const messages = report.warnings.length ? report.warnings : ["問題データに警告はありません。"];
  elements.teacherWarnings.replaceChildren(...messages.map((message) => {
    const item = document.createElement("li");
    item.textContent = message;
    return item;
  }));
}

function showError(error) {
  console.error(error);
  elements.loadingMessage.hidden = true;
  elements.errorMessage.textContent = location.protocol === "file:"
    ? "このアプリはGitHub Pages、またはローカルWebサーバーから開いてください。くわしくはREADMEをご覧ください。"
    : "問題データを確認してから、ページをもう一度読み込んでください。";
  showScreen("errorScreen");
}

async function initialize() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error(`問題データの取得に失敗しました: ${response.status}`);
    quizData = await response.json();
    const report = validateData(quizData);
    if (report.errors.length) throw new Error(report.errors.join("\n"));
    questionMap = new Map(quizData.questions.map((item) => [item.id, item]));

    buildCourseCards();
    updateHomeRecords();
    updateSoundButton();
    updateResumeCard();
    showTeacherCheck(report);
    elements.loadingMessage.hidden = true;
    showScreen("homeScreen");
  } catch (error) {
    showError(error);
  }
}

document.querySelector("#brandButton").addEventListener("click", goHome);
document.querySelector("#quitButton").addEventListener("click", quitQuiz);
document.querySelector("#nextButton").addEventListener("click", nextQuestion);
document.querySelector("#readButton").addEventListener("click", readCurrentQuestion);
document.querySelector("#resultHomeButton").addEventListener("click", goHome);
document.querySelector("#retryButton").addEventListener("click", () => startSession(state.courseId));
elements.resumeButton.addEventListener("click", resumeSession);
elements.soundButton.addEventListener("click", () => {
  profile.sound = !profile.sound;
  saveProfile();
  updateSoundButton();
  if (profile.sound) playTone(620);
});

document.addEventListener("keydown", (event) => {
  if (elements.quizScreen.hidden || event.altKey || event.ctrlKey || event.metaKey) return;
  if (!state.locked && ["1", "2", "3"].includes(event.key)) {
    const index = Number(event.key) - 1;
    const button = elements.choiceList.querySelector(`[data-choice-index="${index}"]`);
    if (button) button.click();
  } else if (state.locked && event.key === "Enter") {
    event.preventDefault();
    nextQuestion();
  }
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {
    // オフライン機能が使えない環境でもクイズ本体は動かす。
  }));
}

initialize();
