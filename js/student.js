/**
 * CAMPUSX — STUDENT PORTAL CONTROLLER
 * Dashboard widgets, profile management, and quick actions.
 */

const StudentController = {
  async initDashboard() {
    const profile = AuthService.getCurrentProfile();
    if (!profile) return;

    // Greeting with appropriate time-of-day
    const hour = new Date().getHours();
    let greeting = "Good morning";
    if (hour >= 12 && hour < 17) greeting = "Good afternoon";
    else if (hour >= 17) greeting = "Good evening";

    const greetingEl = document.getElementById("studentGreeting");
    if (greetingEl) {
      greetingEl.innerHTML = `${greeting}, ${sanitizeHtml(profile.displayName || "Student")} 👋`;
    }

    // Load dynamic dashboard statistics
    try {
      // 1. Attendance
      const attendance = await AttendanceService.getAttendance();
      const overall = AttendanceService.calculateOverall(attendance);
      const attVal = document.getElementById("statAttendanceVal");
      if (attVal) attVal.textContent = `${overall.percentage}%`;

      // 2. Assignments
      const assignments = await AssignmentsService.getAssignments({
        department: profile.department || "all",
        semester: profile.semester || "all",
        section: profile.section || "all"
      });
      const pendingCount = assignments.filter(a => new Date(a.deadline) >= new Date()).length;
      const assignVal = document.getElementById("statAssignmentsVal");
      if (assignVal) assignVal.textContent = pendingCount;

      // 3. Study Hours from Pomodoro
      const pomoStats = PlannerService.getPomoStats();
      const hoursVal = document.getElementById("statStudyHoursVal");
      if (hoursVal) {
        const hours = (pomoStats.totalMinutesFocused / 60).toFixed(1);
        hoursVal.textContent = `${hours} hrs`;
      }

      // 4. Upcoming Exams
      const examsSnap = await window.db.collection("exams").get();
      const examsCount = examsSnap.docs.length;
      const examsVal = document.getElementById("statExamsVal");
      if (examsVal) examsVal.textContent = examsCount;

      // 5. Today's Timetable Widget
      this.renderTodaySchedule();

      // 6. Upcoming Deadlines Widget
      this.renderUpcomingDeadlines(assignments);

      // 7. Recent Notices
      this.renderRecentNotices();

      // 8. Recent Notes
      this.renderRecentNotes();
    } catch (e) {
      console.error("[StudentController] Error loading dashboard:", e);
    }
  },

  // Render Today's Schedule in Dashboard
  async renderTodaySchedule() {
    const container = document.getElementById("todayScheduleContainer");
    if (!container) return;

    const todayName = TimetableService.getTodayName();
    const dayBadge = document.getElementById("todayDayBadge");
    if (dayBadge) dayBadge.textContent = todayName;

    try {
      const profile = AuthService.getCurrentProfile() || {};
      const entries = await TimetableService.getForClass({
        department: profile.department || null,
        semester: profile.semester ? String(profile.semester) : null,
        section: profile.section || null,
        academicYear: profile.academicYear || null
      });

      const grouped = TimetableService.groupByDay(entries);
      const todaySlots = grouped[todayName] || [];

      if (todaySlots.length === 0) {
        renderEmptyState(container, {
          icon: "🎉",
          title: "No Classes Today",
          message: "No scheduled lectures for today. Time for personal study and assignments!"
        });
        return;
      }

      const { current, next } = TimetableService.getActiveAndUpcomingClass(todaySlots);

      let html = "";
      if (current) {
        const currentSubj = current.subjectName || current.subject || "Class";
        const currentTeach = current.teacherName || current.teacher || "Faculty";
        html += `
          <div class="class-live-card" style="margin-bottom: 0.75rem;">
            <div>
              <span class="badge badge-success" style="margin-bottom: 0.25rem;">HAPPENING NOW</span>
              <h4 style="font-size: 1rem; margin-top: 0.25rem;">${sanitizeHtml(currentSubj)}</h4>
              <p class="text-xs text-muted">Room: <strong>${sanitizeHtml(current.room || 'TBD')}</strong> • ${sanitizeHtml(currentTeach)}</p>
            </div>
            <span class="badge badge-primary">${sanitizeHtml(current.startTime)}–${sanitizeHtml(current.endTime)}</span>
          </div>
        `;
      }

      html += `<div style="display: flex; flex-direction: column; gap: 0.5rem;">`;
      todaySlots.forEach(slot => {
        const isCurrent = current && current.id === slot.id;
        const subjTitle = slot.subjectName || slot.subject || "Subject";
        const teachName = slot.teacherName || slot.teacher || "Faculty";
        html += `
          <div class="class-item" style="${isCurrent ? 'opacity: 0.6; border-left: 3px solid var(--primary);' : ''}">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span class="font-semibold text-sm">${sanitizeHtml(subjTitle)}</span>
                <span class="badge badge-secondary" style="font-size: 0.65rem;">${sanitizeHtml(slot.type || 'Lecture')}</span>
              </div>
              <p class="text-xs text-muted" style="margin-top: 0.2rem;">📍 ${sanitizeHtml(slot.room || 'TBD')} • 👨‍🏫 ${sanitizeHtml(teachName)}</p>
            </div>
            <span class="text-xs font-semibold text-primary">${sanitizeHtml(slot.startTime)}–${sanitizeHtml(slot.endTime)}</span>
          </div>
        `;
      });
      html += `</div>`;

      container.innerHTML = html;
    } catch (e) {
      console.error("[StudentController] Error loading today schedule:", e);
      renderEmptyState(container, {
        icon: "⚠️",
        title: "Could Not Load Schedule",
        message: "Failed to load today's schedule."
      });
    }
  },

  // Render Upcoming Deadlines Widget
  async renderUpcomingDeadlines(assignments) {
    const container = document.getElementById("upcomingDeadlinesContainer");
    if (!container) return;

    const activeAssignments = assignments.filter(a => new Date(a.deadline) >= new Date()).slice(0, 4);

    if (activeAssignments.length === 0) {
      renderEmptyState(container, {
        icon: "✨",
        title: "All Caught Up!",
        message: "No pending assignment deadlines coming up."
      });
      return;
    }

    let html = "";
    activeAssignments.forEach(a => {
      const pColor = a.priority === "urgent" ? "badge-danger" : (a.priority === "important" ? "badge-warning" : "badge-info");
      html += `
        <div style="padding: 0.75rem 0; border-bottom: 1px solid var(--border-light); display: flex; align-items: center; justify-content: space-between;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
              <span class="badge ${pColor}" style="font-size: 0.65rem; text-transform: uppercase;">${a.priority}</span>
              <span class="text-sm font-semibold text-main">${sanitizeHtml(a.title)}</span>
            </div>
            <p class="text-xs text-muted">${sanitizeHtml(a.subjectName)} • Due ${formatDate(a.deadline)}</p>
          </div>
          <a href="assignments.html" class="btn btn-secondary btn-sm" style="font-size: 0.75rem;">View</a>
        </div>
      `;
    });
    container.innerHTML = html;
  },

  // Render Recent Notices Widget
  async renderRecentNotices() {
    const container = document.getElementById("recentNoticesContainer");
    if (!container) return;

    const notices = await NoticesService.getNotices();
    const recent = notices.slice(0, 3);

    if (recent.length === 0) {
      renderEmptyState(container, { icon: "📢", title: "No Notices", message: "No active announcements." });
      return;
    }

    let html = "";
    recent.forEach(n => {
      const pBadge = n.priority === "urgent" ? "badge-danger" : (n.priority === "important" ? "badge-warning" : "badge-secondary");
      html += `
        <div style="padding: 0.75rem 0; border-bottom: 1px solid var(--border-light);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.25rem;">
            <span class="badge ${pBadge}" style="font-size: 0.65rem; text-transform: uppercase;">${n.priority}</span>
            <span class="text-xs text-muted">${formatDate(n.createdAt)}</span>
          </div>
          <h5 style="font-size: 0.875rem; margin-bottom: 0.25rem;">${sanitizeHtml(n.title)}</h5>
          <p class="text-xs text-muted" style="line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
            ${sanitizeHtml(n.description)}
          </p>
        </div>
      `;
    });
    container.innerHTML = html;
  },

  // Render Recent Study Notes
  async renderRecentNotes() {
    const container = document.getElementById("recentNotesContainer");
    if (!container) return;

    const notes = await NotesService.getNotes();
    const recent = notes.slice(0, 3);

    if (recent.length === 0) {
      renderEmptyState(container, { icon: "📚", title: "No Notes Yet", message: "Teachers haven't uploaded notes yet." });
      return;
    }

    let html = "";
    recent.forEach(n => {
      html += `
        <div style="padding: 0.75rem 0; border-bottom: 1px solid var(--border-light); display: flex; align-items: center; justify-content: space-between;">
          <div>
            <span class="text-sm font-semibold text-main" style="display: block;">${sanitizeHtml(n.title)}</span>
            <p class="text-xs text-muted">${sanitizeHtml(n.subjectName)} • By ${sanitizeHtml(n.teacherName)}</p>
          </div>
          <div style="display: inline-flex; gap: 0.35rem;">
            <button type="button" onclick="NotesService.viewNote('${n.id}')" class="btn btn-outline btn-sm" style="font-size: 0.75rem; padding: 0.25rem 0.5rem;">👁️ View</button>
            <button type="button" onclick="NotesService.downloadNote('${n.id}')" class="btn btn-primary btn-sm" style="font-size: 0.75rem; padding: 0.25rem 0.5rem;">⬇️ Download</button>
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
  },

  // ------------------------------------------------------------------------
  // Student Profile Management
  // ------------------------------------------------------------------------
  async initProfile() {
    const profile = AuthService.getCurrentProfile();
    if (!profile) return;

    // Populate non-sensitive & sensitive profile fields
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || "";
    };
    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val || "";
    };

    setText("profileDisplayName", profile.displayName);
    setText("profileRoleBadge", (profile.role || "student").toUpperCase());
    setText("profileStudentIdDisplay", profile.studentId || "");
    setText("profileAvatarInitial", profile.avatar || (profile.displayName || "??").substring(0, 2).toUpperCase());

    setVal("inputFullName", profile.displayName);
    setVal("inputEmail", profile.email);
    setVal("inputStudentId", profile.studentId || "");
    setVal("inputDepartment", profile.department || "");
    setVal("inputCourse", profile.course || "");
    setVal("inputSemester", profile.semester || "");
    setVal("inputSection", profile.section || "");
    setVal("inputAcademicYear", profile.academicYear || "");
    setVal("inputPhone", profile.phone || "");
    setVal("inputBio", profile.bio || "");

    // Handle Profile Form Submission (Saving permitted fields)
    const form = document.getElementById("profileEditForm");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
          const fieldsToUpdate = {
            displayName: document.getElementById("inputFullName").value.trim(),
            phone: document.getElementById("inputPhone").value.trim(),
            bio: document.getElementById("inputBio").value.trim()
          };

          // Update permitted fields in Firestore users collection
          await window.db.collection("users").doc(profile.uid).update(fieldsToUpdate);
          const updated = { ...profile, ...fieldsToUpdate };
          sessionStorage.setItem("campusx_user_profile", JSON.stringify(updated));

          showToast("Profile updated successfully!", "success");
          setText("profileDisplayName", updated.displayName);
        } catch (err) {
          showToast(err.message || "Failed to update profile", "danger");
        }
      });
    }
  }
};

window.StudentController = StudentController;
