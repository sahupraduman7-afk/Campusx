/**
 * CAMPUSX — ADMIN PORTAL CONTROLLER
 * Campus-wide metrics, user directory, and academic setup.
 */

const AdminController = {
  async initDashboard() {
    try {
      const usersSnap = await window.db.collection("users").get();
      const allUsers = usersSnap.docs.map(d => d.data());

      const students = allUsers.filter(u => u.role === "student");
      const teachers = allUsers.filter(u => u.role === "teacher");

      const notesSnap = await window.db.collection("notes").get();
      const assignsSnap = await window.db.collection("assignments").get();
      const noticesSnap = await window.db.collection("notices").get();
      const subjectsSnap = await window.db.collection("subjects").get();

      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      setVal("adminTotalStudents", students.length);
      setVal("adminTotalTeachers", teachers.length);
      setVal("adminTotalSubjects", subjectsSnap.docs.length);
      setVal("adminTotalNotes", notesSnap.docs.length);
      setVal("adminTotalAssignments", assignsSnap.docs.length);
      setVal("adminTotalNotices", noticesSnap.docs.length);

      this.renderRecentUsersTable(allUsers.slice(0, 6));
    } catch (e) {
      console.error("[AdminController] Dashboard load error:", e);
    }
  },

  renderRecentUsersTable(users) {
    const container = document.getElementById("adminRecentUsersTable");
    if (!container) return;

    if (users.length === 0) {
      container.innerHTML = `<p class="text-sm text-muted" style="text-align:center; padding: 1.5rem 0;">No users registered yet.</p>`;
      return;
    }

    let rows = "";
    users.forEach(u => {
      const roleBadge = u.role === "admin" ? "badge-danger" : (u.role === "teacher" ? "badge-warning" : "badge-primary");
      rows += `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <div class="user-avatar" style="width: 28px; height: 28px; font-size: 0.75rem;">${u.avatar || (u.displayName || "??").substring(0, 2).toUpperCase()}</div>
              <div>
                <span class="font-semibold text-sm">${sanitizeHtml(u.displayName)}</span>
                <p class="text-xs text-muted">${sanitizeHtml(u.email)}</p>
              </div>
            </div>
          </td>
          <td><span class="badge ${roleBadge}">${(u.role || "student").toUpperCase()}</span></td>
          <td class="text-sm">${sanitizeHtml(u.department || "General")}</td>
          <td class="text-xs text-muted">${formatDate(u.createdAt)}</td>
        </tr>
      `;
    });

    container.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th>Department</th>
            <th>Registered</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }
};

window.AdminController = AdminController;
