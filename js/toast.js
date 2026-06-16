// Toast notification system — bottom-right, slides in, auto-removes.

export function showToast(message) {
// create the container on demand so pages that don't ship one (e.g. studio)
// still get toasts instead of a null-append crash
let container = document.getElementById('toast-container');
if (!container) {
container = document.createElement('div');
container.id = 'toast-container';
document.body.appendChild(container);
}
const toast = document.createElement('div');
toast.className = 'toast';

const text = document.createElement('span');
text.textContent = message;

toast.append(text);
container.appendChild(toast);

setTimeout(() => toast.classList.add('out'), 2700);
setTimeout(() => toast.remove(), 3100);
}
