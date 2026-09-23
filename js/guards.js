/**
 * CAMPUSX — ROUTE AUTHORIZATION GUARDS & APP SHELL SYNC
 * Protects pages against unauthorized access and populates user info.
 */

(function () {
  function checkRouteAccess() {
    const currentPath = window.location.pathname.toLowerCase();

    // Determine expected role from directory path
    let requiredRole = null;
    if (currentPath.includes("/student/")) requiredRole = "student";
    else if (currentPath.includes("/teacher/")) requiredRole = "teacher";
    else if (currentPath.includes("/admin/")) requiredRole = "admin";

    // If on a public page, do not guard
    if (!requiredRole) return;

    const profile = AuthService.getCurrentProfile();
    const isSubDir = currentPath.includes("/student/") || currentPath.includes("/teacher/") || currentPath.includes("/admin/");
    const loginUrl = isSubDir ? "../login.html" : "login.html";

    // If no active user session, redirect to login
    if (!profile) {
      console.warn("[Guard] Unauthorized access. Redirecting to login.");
      window.location.href = loginUrl;
      return;
    }

    // Check account status: suspended accounts cannot access any portal
    if (profile.status === "suspended") {
      console.warn("[Guard] Account is suspended. Logging out.");
      AuthService.logout();
      return;
    }

    // Role verification
    if (profile.role !== requiredRole && profile.role !== "admin") {
      console.warn(`[Guard] Role mismatch! User is ${profile.role} but attempted to access ${requiredRole} area.`);
      AuthService.redirectToRoleDashboard(profile.role);
      return;
    }

    // Populate user profile info in DOM
    syncUserInterface(profile);
  }

  function syncUserInterface(profile) {
    document.addEventListener("DOMContentLoaded", () => {
      // User name displays
      document.querySelectorAll(".user-name, #userNameDisplay").forEach(el => {
        el.textContent = profile.displayName || "User";
      });

      // Role badge displays
      const isPendingTeacher = profile.role === "teacher" && profile.status === "pending";
      document.querySelectorAll(".user-role-badge, #userRoleDisplay").forEach(el => {
        if (isPendingTeacher) {
          el.textContent = "TEACHER (PENDING)";
          el.className = "badge badge-warning user-role-badge";
        } else {
          el.textContent = profile.role ? profile.role.toUpperCase() : "STUDENT";
        }
      });

      // Show Pending Teacher Banner & restrict write actions if pending
      if (isPendingTeacher) {
        const mainContent = document.querySelector(".main-content");
        if (mainContent && !document.getElementById("pendingTeacherBanner")) {
          const banner = document.createElement("div");
          banner.id = "pendingTeacherBanner";
          banner.style.cssText = "background: rgba(245, 158, 11, 0.12); border: 1px solid #f59e0b; color: #b45309; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1.5rem; display: flex; align-items: flex-start; gap: 0.75rem;";
          banner.innerHTML = `
            <span style="font-size: 1.25rem; line-height: 1;">⏳</span>
            <div>
              <strong style="display: block; margin-bottom: 0.25rem;">Account Pending Administrator Approval</strong>
              <span style="font-size: 0.875rem;">Your teacher registration has been submitted and is currently pending verification by the college administrator. Uploading notes, creating assignments, and posting notices are restricted until an admin activates your account.</span>
            </div>
          `;
          mainContent.insertBefore(banner, mainContent.firstChild);
        }

        // Disable modal trigger buttons for creation/upload
        document.querySelectorAll("[data-modal-target='uploadNoteModal'], [data-modal-target='createAssignmentModal'], [data-modal-target='createNoticeModal']").forEach(btn => {
          btn.disabled = true;
          btn.title = "Pending administrator approval";
          btn.style.opacity = "0.5";
          btn.style.cursor = "not-allowed";
        });
      }

      // Check if user's email address is unverified
      if (window.auth) {
        window.auth.onAuthStateChanged(user => {
          if (user && !user.emailVerified && !document.getElementById("unverifiedEmailBanner")) {
            const mainContent = document.querySelector(".main-content");
            if (mainContent) {
              const banner = document.createElement("div");
              banner.id = "unverifiedEmailBanner";
              banner.style.cssText = "background: rgba(59, 130, 246, 0.08); border: 1px solid #3b82f6; color: #1d4ed8; border-radius: 8px; padding: 0.875rem 1.25rem; margin-bottom: 1.25rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;";
              banner.innerHTML = `
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                  <span style="font-size: 1.2rem; line-height: 1;">✉️</span>
                  <div>
                    <strong style="display: block; font-size: 0.875rem;">Please verify your college email address</strong>
                    <span style="font-size: 0.8125rem; color: #2563eb;">A verification link was sent to <b>${user.email}</b>. Please check your inbox and confirm your address.</span>
                  </div>
                </div>
                <button type="button" id="resendVerificationBtn" class="btn btn-sm" style="border: 1px solid #3b82f6; color: #1d4ed8; background: var(--surface, #ffffff); white-space: nowrap; font-weight: 600;">
                  Resend Verification Email
                </button>
              `;
              mainContent.insertBefore(banner, mainContent.firstChild);

              const resendBtn = banner.querySelector("#resendVerificationBtn");
              if (resendBtn) {
                resendBtn.addEventListener("click", async () => {
                  resendBtn.disabled = true;
                  resendBtn.textContent = "Sending...";
                  try {
                    await AuthService.resendVerificationEmail();
                    showToast("Verification email sent! Check your inbox and spam folder.", "success");
                    resendBtn.textContent = "Email Sent!";
                  } catch (e) {
                    showToast(e.message, "danger");
                    resendBtn.disabled = false;
                    resendBtn.textContent = "Resend Verification Email";
                  }
                });
              }
            }
          }
        });
      }

      // Avatar displays
      document.querySelectorAll(".user-avatar, #userAvatarDisplay").forEach(el => {
        const initials = profile.avatar || (profile.displayName ? profile.displayName.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase() : "CX");
        el.textContent = initials;
      });

      // Bind logout buttons
      document.querySelectorAll(".logout-btn, #logoutBtn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          confirmDialog({
            title: "Sign Out",
            message: "Are you sure you want to end your session?",
            confirmText: "Sign Out",
            onConfirm: () => AuthService.logout()
          });
        });
      });

      // Auto-highlight active sidebar navigation item
      const currentFile = window.location.pathname.split("/").pop() || "dashboard.html";
      document.querySelectorAll(".sidebar-menu .nav-link").forEach(link => {
        const href = link.getAttribute("href");
        if (href && href.endsWith(currentFile)) {
          link.classList.add("active");
        } else if (!href || !href.endsWith(currentFile)) {
          link.classList.remove("active");
        }
      });
    });
  }

  // Run guard
  checkRouteAccess();
})();
