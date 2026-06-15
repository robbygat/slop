// Toast notification system — bottom-right, slides in, auto-removes.

export function showToast(message) {
const container = document.getElementById('toast-container');
const toast = document.createElement('div');
toast.className = 'toast';

const text = document.createElement('span');
text.textContent = message;

toast.append(text);
container.appendChild(toast);

setTimeout(() => toast.classList.add('out'), 2700);
setTimeout(() => toast.remove(), 3100);
}
