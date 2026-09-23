/**
 * CAMPUSX — TEACHER PORTAL CONTROLLER
 * Teacher dashboard metrics, notes upload (mandatory), assignments (optional file),
 * submissions viewer, and announcements manager.
 */

const TeacherController = {
  async initDashboard() {
    const profile = AuthService.getCurrentProfile();
    if (!profile) return;

    try {
      // 1. Fetch counts
      const notes = await NotesService.getNotes({ teacherId: profile.uid });
      const assignments = await AssignmentsService.getAssignments({ teacherId: profile.uid });
      const notices = await NoticesService.getNotices();
      const studentsSnap = await window.db.collection("users").where("role", "==", "student").get();
      const totalStudents = studentsSnap.size;

      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      setVal("teacherNotesCount", notes.length);
      setVal("teacherAssignmentsCount", assignments.length);
      setVal("teacherNoticesCount", notices.length);
      setVal("teacherStudentsCount", totalStudents);

      // Render Recent Uploads Table
      this.renderRecentTeacherContent(notes, assignments);
    } catch (e) {
      console.error("[TeacherController] Error:", e);
    }
  },

  renderRecentTeacherContent(notes, assignments) {
    const container = document.getElementById("teacherRecentActivityTable");
    if (!container) return;

    const combined = [
      ...notes.map(n => ({ ...n, itemType: "Note", date: n.createdAt })),
      ...assignments.map(a => ({ ...a, itemType: "Assignment", date: a.createdAt }))
    ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 5);

    if (combined.length === 0) {
      renderEmptyState(container, {
        icon: "📝",
        title: "No Content Uploaded Yet",
        message: "Start by uploading lecture notes or creating an assignment for your students."
      });
      return;
    }

    let rows = "";
    combined.forEach(item => {
      const typeBadge = item.itemType === "Note" ? "badge-primary" : "badge-info";
      rows += `
        <tr>
          <td><span class="badge ${typeBadge}">${item.itemType}</span></td>
          <td class="font-semibold">${sanitizeHtml(item.title)}</td>
          <td>${sanitizeHtml(item.subjectName || "")}</td>
          <td>${formatDate(item.date)}</td>
          <td>
            ${item.itemType === "Note" ? `
              <button type="button" onclick="NotesService.viewNote('${item.id}')" class="btn btn-outline btn-sm">
                View File
              </button>
            ` : (item.storagePath || item.attachmentUrl) ? `
              <button type="button" onclick="AssignmentsService.viewAttachment('${item.storagePath || ''}', '${item.attachmentUrl || ''}')" class="btn btn-outline btn-sm">
                View File
              </button>
            ` : `<span class="text-xs text-muted">No File</span>`}
          </td>
        </tr>
      `;
    });

    container.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Title</th>
            <th>Subject</th>
            <th>Date</th>
            <th>Attachment</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  },

  // Setup Note Upload Form with Progress Bar & Validation
  setupNoteUploadModal() {
    const form = document.getElementById("uploadNoteForm");
    if (!form) return;

    const fileInput = document.getElementById("noteFileInput");
    const dropzone = document.getElementById("noteFileDropzone");
    const fileNameDisplay = document.getElementById("noteFileNameDisplay");
    const progressWrap = document.getElementById("noteUploadProgressWrap");
    const progressBar = document.getElementById("noteUploadProgressBar");
    const progressText = document.getElementById("noteUploadProgressText");

    if (dropzone && fileInput) {
      dropzone.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", () => {
        if (fileInput.files.length > 0) {
          fileNameDisplay.textContent = `Selected: ${fileInput.files[0].name} (${formatFileSize(fileInput.files[0].size)})`;
        }
      });
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const profile = AuthService.getCurrentProfile();

      const title = document.getElementById("noteTitleInput").value;
      const subjectSelect = document.getElementById("noteSubjectSelect");
      const subjectId = subjectSelect.value;
      const subjectName = subjectSelect.options[subjectSelect.selectedIndex].text;
      const description = document.getElementById("noteDescInput").value;
      const file = fileInput.files[0];

      if (!file) {
        showToast("A study material document file is required.", "danger");
        return;
      }

      const submitBtn = form.querySelector("button[type='submit']");
      submitBtn.disabled = true;
      if (progressWrap) progressWrap.style.display = "block";

      try {
        await NotesService.uploadNote({
          title,
          subjectId,
          subjectName,
          description,
          file,
          teacherId: profile.uid,
          teacherName: profile.displayName,
          onProgress: (percent) => {
            if (progressBar) progressBar.style.width = percent + "%";
            if (progressText) progressText.textContent = `${percent}% uploaded`;
          }
        });

        showToast("Study note published successfully!", "success");
        closeModal("uploadNoteModal");
        form.reset();
        if (fileNameDisplay) fileNameDisplay.textContent = "";
        if (progressWrap) progressWrap.style.display = "none";
        // Refresh notes list if on notes page
        if (window.loadTeacherNotes) window.loadTeacherNotes();
      } catch (err) {
        showToast(err.message || "Failed to upload note", "danger");
      } finally {
        submitBtn.disabled = false;
      }
    });
  },

  // Setup Assignment Form (Optional Attachment)
  setupAssignmentModal() {
    const form = document.getElementById("createAssignmentForm");
    if (!form) return;

    const fileInput = document.getElementById("assignFileInput");
    const fileNameDisplay = document.getElementById("assignFileNameDisplay");
    if (fileInput && fileNameDisplay) {
      fileInput.addEventListener("change", () => {
        if (fileInput.files.length > 0) {
          fileNameDisplay.textContent = `Optional file selected: ${fileInput.files[0].name}`;
        }
      });
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const profile = AuthService.getCurrentProfile();

      const title = document.getElementById("assignTitleInput").value;
      const deptEl = document.getElementById("assignDeptSelect");
      const semEl = document.getElementById("assignSemSelect");
      const secEl = document.getElementById("assignSectionSelect");
      const department = deptEl ? deptEl.value : "all";
      const semester = semEl ? semEl.value : "all";
      const section = secEl ? secEl.value : "all";

      const subjectSelect = document.getElementById("assignSubjectSelect");
      const subjectId = subjectSelect.value;
      const subjectName = subjectSelect.options[subjectSelect.selectedIndex]?.text || "General";
      const description = document.getElementById("assignDescInput").value;
      const deadline = document.getElementById("assignDeadlineInput").value;
      const priority = document.getElementById("assignPrioritySelect").value;
      const file = fileInput && fileInput.files[0] ? fileInput.files[0] : null;

      const submitBtn = form.querySelector("button[type='submit']");
      submitBtn.disabled = true;

      try {
        await AssignmentsService.createAssignment({
          title,
          department,
          semester,
          section,
          subjectId,
          subjectName,
          description,
          deadline,
          priority,
          file, // May be null if teacher did not choose one
          teacherId: profile.uid,
          teacherName: profile.displayName
        });

        showToast(file ? "Assignment with attachment published!" : "Assignment published successfully!", "success");
        closeModal("createAssignmentModal");
        form.reset();
        if (fileNameDisplay) fileNameDisplay.textContent = "";
        if (window.loadTeacherAssignments) window.loadTeacherAssignments();
      } catch (err) {
        showToast(err.message || "Failed to create assignment", "danger");
      } finally {
        submitBtn.disabled = false;
      }
    });
  },

  // Initialize Teacher Profile Page
  async initProfile() {
    const profile = AuthService.getCurrentProfile();
    if (!profile) return;

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val || "";
    };
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || "";
    };

    setText("teacherDisplayName", profile.displayName || "Faculty Member");
    setText("teacherAvatarBig", profile.avatar || (profile.displayName ? profile.displayName.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase() : "TC"));
    setText("teacherDesignationDisplay", profile.designation || "Faculty Member");

    setVal("teacherNameInput", profile.displayName || "");
    setVal("teacherEmailInput", profile.email || "");
    setVal("teacherDeptInput", profile.department || "");
    setVal("teacherCabinInput", profile.cabin || "");
    setVal("teacherBioInput", profile.bio || "");

    const form = document.getElementById("teacherProfileForm");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
          const fieldsToUpdate = {
            displayName: document.getElementById("teacherNameInput").value.trim(),
            department: document.getElementById("teacherDeptInput").value.trim(),
            cabin: document.getElementById("teacherCabinInput").value.trim(),
            bio: document.getElementById("teacherBioInput") ? document.getElementById("teacherBioInput").value.trim() : ""
          };

          await window.db.collection("users").doc(profile.uid).update(fieldsToUpdate);
          const updated = { ...profile, ...fieldsToUpdate };
          sessionStorage.setItem("campusx_user_profile", JSON.stringify(updated));

          showToast("Profile details updated successfully!", "success");
          setText("teacherDisplayName", updated.displayName);
        } catch (err) {
          showToast(err.message || "Failed to update profile", "danger");
        }
      });
    }
  }
};

window.TeacherController = TeacherController;
