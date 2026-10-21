const canvas = document.querySelector('#stars');
const ctx = canvas.getContext('2d');
const stage = document.querySelector('#stage');
const story = document.querySelector('#story');
const storyLine = document.querySelector('#storyLine');
const previousLine = document.querySelector('#previousLine');
const progress = document.querySelector('.progress-area');
const progressFill = document.querySelector('#progressFill');
const progressLabel = document.querySelector('#progressLabel');
const bgm = document.querySelector('#bgm');
const soundToggle = document.querySelector('#soundToggle');
const continueHint = document.querySelector('#continueHint');
const reviewButton = document.querySelector('#reviewButton');
const reviewPanel = document.querySelector('#reviewPanel');
const reviewBackdrop = document.querySelector('#reviewBackdrop');
const closeReviewButton = document.querySelector('#closeReview');
const reviewList = document.querySelector('#reviewList');

let lines = [];
let index = -1;
let started = false;
let locked = false;
let stars = [];
let shootingStar = null;
let afterIndex = -1;
let finished = false;
let audioContext;
let audioFilter;
let audioGain;
const history = [];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finalCredit = { text: 'BGM：まらしぃ - ハルトマンの睡眠少女', emphasis: true };
const postEndingLines = [
  { text: '.....' },
  { text: '.....' },
  { text: '.....' },
  { text: '她没有骗你。' },
  { text: '她真的等了你很久。' },
  { text: '只是她忘了，心里还藏着一个人。' },
  { text: '.....' },
  { text: '.....' },
  { text: '其实那个才是我哦。' },
  { text: '......' },
  { text: '......' },
  { text: '我说......' },
  { text: '换你来藏了好不好呀。', red: true }
];

function cleanMarkdown(text) {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => ({
    text: line.replace(/^#{1,6}\s+/, '').replace(/\*\*/g, ''),
    emphasis: /^\*\*.*\*\*$/.test(line)
  }));
}

async function loadStory() {
  try {
    const response = await fetch('./story.md');
    if (!response.ok) throw new Error('Story unavailable');
    lines = cleanMarkdown(await response.text());
    progressLabel.textContent = `00 / ${String(lines.length).padStart(2, '0')}`;
  } catch {
    lines = [{ text: '故事好像藏得太好了。请刷新页面，再找一次吧。', emphasis: false }];
  }
}

function startMusic() {
  bgm.volume = 0.62;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass && !audioContext) {
      audioContext = new AudioContextClass();
      const source = audioContext.createMediaElementSource(bgm);
      audioFilter = audioContext.createBiquadFilter();
      audioFilter.type = 'lowpass';
      audioFilter.frequency.value = 18000;
      audioGain = audioContext.createGain();
      source.connect(audioFilter).connect(audioGain).connect(audioContext.destination);
    }
    audioContext?.resume().catch(() => {});
  } catch {
    // Playback rate and volume still darken the track if Web Audio is unavailable.
  }
  bgm.play().catch(() => {
    soundToggle.setAttribute('aria-pressed', 'true');
    soundToggle.setAttribute('aria-label', '播放音乐');
  });
}

function darkenMusic(step) {
  const depth = Math.min(step / (postEndingLines.length - 1), 1);
  bgm.preservesPitch = false;
  bgm.mozPreservesPitch = false;
  bgm.webkitPreservesPitch = false;
  bgm.playbackRate = 0.94 - depth * 0.23;
  bgm.volume = 0.56 - depth * 0.17;
  if (audioFilter && audioContext) {
    const frequency = 8000 * Math.pow(420 / 8000, depth);
    audioFilter.frequency.setTargetAtTime(frequency, audioContext.currentTime, 0.5);
  }
}

function finishStory() {
  finished = true;
  document.body.classList.add('blackout');
  stage.setAttribute('aria-label', '故事结束');
  storyLine.textContent = '';
  previousLine.textContent = '';
  continueHint.textContent = '';
  progress.classList.remove('visible');
  if (audioGain && audioContext) {
    audioGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.35);
  } else {
    bgm.volume = 0;
  }
  window.setTimeout(() => bgm.pause(), 1800);
}

function showNext() {
  if (finished || locked || !lines.length || reviewPanel.classList.contains('open')) return;
  if (!started) {
    started = true;
    document.body.classList.add('started');
    story.classList.add('active');
    progress.classList.add('visible');
    startMusic();
  }
  locked = true;
  const oldText = storyLine.textContent;
  let current;
  if (index < lines.length - 1) {
    index += 1;
    current = lines[index];
  } else {
    if (afterIndex < 0) {
      current = finalCredit;
      afterIndex = 0;
    } else if (afterIndex < postEndingLines.length) {
      current = postEndingLines[afterIndex];
      if (afterIndex === 0) document.body.classList.add('reveal');
      darkenMusic(afterIndex);
      afterIndex += 1;
    } else {
      finishStory();
      return;
    }
  }
  previousLine.textContent = oldText;
  previousLine.classList.toggle('visible', Boolean(oldText));
  storyLine.classList.remove('entering');
  void storyLine.offsetWidth;
  storyLine.textContent = current.text;
  storyLine.classList.toggle('emphasis', current.emphasis);
  storyLine.classList.toggle('red', Boolean(current.red));
  storyLine.classList.add('entering');
  history.push(current.text);
  appendReviewEntry(current.text);
  continueHint.textContent = index >= lines.length - 1 ? '再点一下' : '点击 · 继续';
  progressFill.style.width = `${((index + 1) / lines.length) * 100}%`;
  progressLabel.textContent = index >= lines.length - 1 ? 'END' : `${String(index + 1).padStart(2, '0')} / ${String(lines.length).padStart(2, '0')}`;
  window.setTimeout(() => { locked = false; }, reducedMotion ? 20 : 420);
}

function appendReviewEntry(text) {
  const empty = reviewList.querySelector('.review-empty');
  if (empty) empty.remove();
  const entry = document.createElement('p');
  entry.className = 'review-entry';
  entry.textContent = text;
  reviewList.append(entry);
  reviewList.scrollTop = reviewList.scrollHeight;
}

function openReview() {
  if (!history.length) reviewList.innerHTML = '<p class="review-empty">还没有可以回顾的内容。</p>';
  reviewBackdrop.hidden = false;
  reviewPanel.classList.add('open');
  reviewPanel.setAttribute('aria-hidden', 'false');
  closeReviewButton.focus();
}

function closeReview() {
  reviewPanel.classList.remove('open');
  reviewPanel.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => { reviewBackdrop.hidden = true; }, reducedMotion ? 0 : 450);
  stage.focus();
}

stage.addEventListener('click', showNext);
stage.addEventListener('keydown', event => {
  if (['Enter', ' ', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    showNext();
  }
});
soundToggle.addEventListener('click', event => {
  event.stopPropagation();
  if (bgm.paused) {
    audioContext?.resume().catch(() => {});
    bgm.play();
    soundToggle.setAttribute('aria-pressed', 'false');
    soundToggle.setAttribute('aria-label', '关闭音乐');
  } else {
    bgm.pause();
    soundToggle.setAttribute('aria-pressed', 'true');
    soundToggle.setAttribute('aria-label', '播放音乐');
  }
});
reviewButton.addEventListener('click', openReview);
closeReviewButton.addEventListener('click', closeReview);
reviewBackdrop.addEventListener('click', closeReview);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && reviewPanel.classList.contains('open')) closeReview();
});

function resizeCanvas() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * ratio;
  canvas.height = innerHeight * ratio;
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const count = Math.round(Math.min(190, Math.max(80, innerWidth * innerHeight / 9000)));
  stars = Array.from({ length: count }, () => ({
    x: Math.random() * innerWidth, y: Math.random() * innerHeight,
    r: Math.random() * 1.15 + .18, a: Math.random() * .68 + .16,
    d: Math.random() * .012 + .003, phase: Math.random() * Math.PI * 2
  }));
}

function drawStars(time = 0) {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  for (const star of stars) {
    const alpha = reducedMotion ? star.a : star.a * (.7 + Math.sin(time * star.d + star.phase) * .3);
    ctx.beginPath();
    ctx.fillStyle = `rgba(238,228,255,${alpha})`;
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
  if (!reducedMotion) {
    if (!shootingStar && Math.random() < .0022) shootingStar = { x: Math.random() * innerWidth * .75, y: Math.random() * innerHeight * .34, life: 0 };
    if (shootingStar) {
      const s = shootingStar;
      const gradient = ctx.createLinearGradient(s.x, s.y, s.x - 100, s.y - 48);
      gradient.addColorStop(0, `rgba(255,220,246,${1 - s.life / 55})`);
      gradient.addColorStop(1, 'rgba(255,130,200,0)');
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - 100, s.y - 48);
      ctx.stroke();
      s.x += 6; s.y += 2.9; s.life += 1;
      if (s.life > 55) shootingStar = null;
    }
  }
  requestAnimationFrame(drawStars);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
drawStars();
loadStory();
