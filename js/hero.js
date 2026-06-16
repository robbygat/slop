// Hero: hint-chip typewriter, the model picker, the cook-game flow, and the waitlist.

import { showToast } from './toast.js';
import { cookGameForReal } from './cook.js';
import { MODELS, MODEL_CHOICES } from './ai.js';

let typeTimer = null;

const MODEL_KEY = 'slop-model'; // shared with Slop Studio

function shortModelLabel(choice) {
  if (!choice) return 'Model';
  const dash = choice.label.indexOf(' — ');
  return dash >= 0 ? choice.label.slice(0, dash) : choice.label;
}

function setModelMenuOpen(open) {
  const wrap = document.getElementById('hero-model-wrap');
  const btn = document.getElementById('hero-model-btn');
  const menu = document.getElementById('hero-model-menu');
  if (!wrap || !btn || !menu) return;
  wrap.classList.toggle('open', open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  menu.toggleAttribute('hidden', !open);
}

function paintModelMenu(sel, list) {
  if (!list || !sel) return;
  list.innerHTML = MODEL_CHOICES.map((m) => {
    const on = m.id === sel.value;
    const lock = m.tier === 'pro' ? '<span class="model-menu-lock" aria-hidden="true">🔒</span>' : '';
    return `<button type="button" class="model-menu-opt${on ? ' active' : ''}" role="option" aria-selected="${on}" data-id="${m.id}">${lock}<span class="model-menu-opt-label">${m.label}</span></button>`;
  }).join('');
}

function syncModelButton(sel) {
  const btn = document.getElementById('hero-model-btn');
  const choice = MODEL_CHOICES.find((m) => m.id === sel?.value);
  if (!btn) return;
  const name = shortModelLabel(choice);
  btn.title = choice ? `${name}${choice.tier === 'pro' ? ' (Pro)' : ''}` : 'Choose AI model';
  btn.setAttribute('aria-label', choice ? `Model: ${name}. Choose AI model` : 'Choose AI model');
}

// Compact "+" model menu — hidden select keeps cook.js + localStorage in sync.
function initModelPicker() {
  const sel = document.getElementById('hero-model');
  const list = document.getElementById('hero-model-list');
  const btn = document.getElementById('hero-model-btn');
  const wrap = document.getElementById('hero-model-wrap');
  if (!sel || !list || !btn || !wrap) return;

  sel.innerHTML = MODEL_CHOICES.map((m) => `<option value="${m.id}">${m.label}</option>`).join('');
  const saved = localStorage.getItem(MODEL_KEY) || MODELS.cook;
  if (MODEL_CHOICES.some((m) => m.id === saved)) sel.value = saved;

  const refresh = () => {
    paintModelMenu(sel, list);
    syncModelButton(sel);
  };
  refresh();

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    setModelMenuOpen(!wrap.classList.contains('open'));
  });

  list.addEventListener('click', (e) => {
    const opt = e.target.closest('.model-menu-opt');
    if (!opt) return;
    sel.value = opt.dataset.id;
    localStorage.setItem(MODEL_KEY, sel.value);
    refresh();
    setModelMenuOpen(false);
  });

  document.addEventListener('click', (e) => {
    if (!wrap.classList.contains('open')) return;
    if (wrap.contains(e.target)) return;
    setModelMenuOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setModelMenuOpen(false);
  });
}

// grow the command-bar textarea with its content (premium single-line → multi-line feel)
function autoGrow(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 168) + 'px';
}

export function setPrompt(text) {
  const textarea = document.getElementById('prompt-input');
  clearInterval(typeTimer);
  textarea.value = '';
  textarea.focus();

  let i = 0;
  typeTimer = setInterval(() => {
    textarea.value = text.slice(0, ++i);
    autoGrow(textarea);
    if (i >= text.length) clearInterval(typeTimer);
  }, 28);
}

export async function cookGame() {
  const textarea = document.getElementById('prompt-input');
  const btn = document.getElementById('generate-btn');
  const pwin = document.getElementById('pwin');

  if (!textarea.value.trim()) {
    showToast('describe your game first! the pot is empty');
    pwin.classList.remove('shake');
    void pwin.offsetWidth; // restart animation
    pwin.classList.add('shake');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Cooking…';

  const game = await cookGameForReal(textarea.value.trim());

  if (game) {
    btn.textContent = 'OK Published!';
    btn.classList.add('done');
  }
  setTimeout(() => {
    btn.disabled = false;
    btn.classList.remove('done');
    btn.textContent = 'Generate';
  }, 1200);
}

function initWaitlist() {
  const form = document.getElementById('waitlist-form');
  const email = document.getElementById('waitlist-email');
  const note = document.getElementById('waitlist-note');

  // remember a previous signup
  const saved = localStorage.getItem('slop-waitlist-email');
  if (saved) {
    email.value = saved;
    note.textContent = `you're on the list as ${saved}`;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = email.value.trim();
    if (!value) return;
    try {
      const { api } = await import('./api.js');
      await api.joinWaitlist(value); // lands in the database when the server is up
    } catch (err) {
      note.textContent = err.message;
      return;
    }
    localStorage.setItem('slop-waitlist-email', value);
    note.textContent = `you're on the list as ${value} — we'll email you at launch`;
    showToast('welcome aboard — you are on the waitlist');
  });
}

export function initHero() {
  initModelPicker();

  // hint chips typewriter
  document.querySelectorAll('.hint-chip').forEach((chip) => {
    chip.addEventListener('click', () => setPrompt(chip.dataset.prompt));
  });

  document.getElementById('generate-btn').addEventListener('click', cookGame);

  // auto-grow the command bar + ⌘/Ctrl+Enter to generate
  const promptEl = document.getElementById('prompt-input');
  if (promptEl) {
    promptEl.addEventListener('input', () => autoGrow(promptEl));
    promptEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); cookGame(); }
    });
  }

  // nav "Cook a Game" scrolls to the prompt window and focuses it
  document.getElementById('nav-cook').addEventListener('click', () => {
    document.getElementById('pwin').scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => document.getElementById('prompt-input').focus(), 600);
  });

  initWaitlist();
}
