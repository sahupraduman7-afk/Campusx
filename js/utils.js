/**
 * CAMPUSX — REUSABLE UTILITIES & UI HELPERS
 * Toast notifications, modals, confirm dialogs, formatters, and drawer handlers.
 */

// --------------------------------------------------------------------------
// Toast System
// --------------------------------------------------------------------------
function showToast(message, type = "info", duration = 3500) {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: "✓",
    danger: "✕",
    warning: "⚠",
    info: "ℹ"
  };

  toast.innerHTML = `
    <div style="display: flex; align-items: center; gap: 0.75rem;">
      <span style="font-weight: 700; font-size: 1.1rem;">${iconMap[type] || "ℹ"}</span>
      <span class="toast-message">${sanitizeHtml(message)}</span>
    </div>
    <button class="toast-close" aria-label="Close">&times;</button>
  `;

  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  const dismiss = () => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 250);
  };

  toast.querySelector(".toast-close").addEventListener("click", dismiss);
  setTimeout(dismiss, duration);
}

// --------------------------------------------------------------------------
// Modal Helpers
// --------------------------------------------------------------------------
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add("active");
    document.body.style.overflow = "hidden";
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove("active");
    document.body.style.overflow = "";
  }
}

// Global listener to close modals when clicking on overlay background or data-close
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-overlay")) {
    closeModal(e.target.id);
  } else if (e.target.hasAttribute("data-close-modal")) {
    const modal = e.target.closest(".modal-overlay");
    if (modal) closeModal(modal.id);
  }
});

// ESC key closes any open modal
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal-overlay.active").forEach(m => closeModal(m.id));
  }
});

// --------------------------------------------------------------------------
// Confirmation Dialog
// --------------------------------------------------------------------------
function confirmDialog({ title = "Confirm Action", message = "Are you sure you want to proceed?", confirmText = "Confirm", cancelText = "Cancel", onConfirm }) {
  let overlay = document.getElementById("globalConfirmModal");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "globalConfirmModal";
    overlay.className = "modal-overlay";
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div class="modal" style="max-width: 420px;">
      <div class="modal-header">
        <h3 class="modal-title">${sanitizeHtml(title)}</h3>
        <button class="btn-icon" onclick="closeModal('globalConfirmModal')">&times;</button>
      </div>
      <div class="modal-body">
        <p class="text-muted" style="font-size: 0.9375rem;">${sanitizeHtml(message)}</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('globalConfirmModal')">${sanitizeHtml(cancelText)}</button>
        <button class="btn btn-danger" id="globalConfirmBtn">${sanitizeHtml(confirmText)}</button>
      </div>
    </div>
  `;

  openModal("globalConfirmModal");

  const confirmBtn = document.getElementById("globalConfirmBtn");
  confirmBtn.onclick = async () => {
    closeModal("globalConfirmModal");
    if (typeof onConfirm === "function") {
      await onConfirm();
    }
  };
}

// --------------------------------------------------------------------------
// Formatters & Sanitizers
// --------------------------------------------------------------------------
function sanitizeHtml(str) {
  if (!str) return "";
  const temp = document.createElement("div");
  temp.textContent = str;
  return temp.innerHTML;
}

function formatDate(dateInput) {
  if (!dateInput) return "N/A";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatDateTime(dateInput) {
  if (!dateInput) return "N/A";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(1)} ${units[i]}`;
}

// --------------------------------------------------------------------------
// UI State Helpers (Empty & Skeleton)
// --------------------------------------------------------------------------
function renderEmptyState(container, { icon = "📂", title = "No items found", message = "There is nothing to display here right now.", actionText, onAction }) {
  if (typeof container === "string") container = document.getElementById(container);
  if (!container) return;

  let actionHtml = "";
  if (actionText) {
    actionHtml = `<button class="btn btn-primary btn-sm" id="emptyStateActionBtn">${sanitizeHtml(actionText)}</button>`;
  }

  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <h4 class="empty-state-title">${sanitizeHtml(title)}</h4>
      <p class="empty-state-text">${sanitizeHtml(message)}</p>
      ${actionHtml}
    </div>
  `;

  if (actionText && typeof onAction === "function") {
    const btn = container.querySelector("#emptyStateActionBtn");
    if (btn) btn.addEventListener("click", onAction);
  }
}

function renderSkeletonCards(container, count = 3) {
  if (typeof container === "string") container = document.getElementById(container);
  if (!container) return;

  let html = "";
  for (let i = 0; i < count; i++) {
    html += `
      <div class="card" style="margin-bottom: 1rem;">
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-text" style="width: 80%;"></div>
      </div>
    `;
  }
  container.innerHTML = html;
}

// --------------------------------------------------------------------------
// Responsive Sidebar & User Profile Dropdown Initializer
// --------------------------------------------------------------------------
function initDashboardShell() {
  const mobileToggle = document.querySelector(".mobile-toggle");
  const sidebar = document.querySelector(".sidebar");

  if (mobileToggle && sidebar) {
    let backdrop = document.querySelector(".sidebar-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "sidebar-backdrop";
      document.body.appendChild(backdrop);
    }

    mobileToggle.addEventListener("click", () => {
      sidebar.classList.toggle("mobile-open");
      backdrop.classList.toggle("active");
    });

    backdrop.addEventListener("click", () => {
      sidebar.classList.remove("mobile-open");
      backdrop.classList.remove("active");
    });
  }

  // User Dropdown toggle
  const userMenuBtn = document.querySelector(".user-profile-menu");
  const userDropdown = document.querySelector(".user-dropdown");
  if (userMenuBtn && userDropdown) {
    userMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle("show");
    });

    document.addEventListener("click", () => {
      userDropdown.classList.remove("show");
    });
  }
}

document.addEventListener("DOMContentLoaded", initDashboardShell);
