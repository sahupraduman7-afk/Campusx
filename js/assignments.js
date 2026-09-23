/**
 * CAMPUSX — ASSIGNMENTS & SUBMISSIONS MODULE
 * Assignment management (Teacher/Admin) & secure submission portal (Student).
 *
 * File storage is backed by Supabase Storage (campusx-files bucket, private).
 * Application metadata & submissions are stored in Firebase Firestore.
 */

const ASSIGNMENTS_ALLOWED_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
];

const ASSIGNMENTS_ALLOWED_EXTS = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"];
const ASSIGNMENTS_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

const AssignmentsService = {
  // Validate file against allowed formats and size
  validateFile(file) {
    if (!file) return null;
    if (file.size > ASSIGNMENTS_MAX_BYTES) {
      throw new Error("File exceeds 25 MB limit. Please select a smaller file.");
    }

    const ext = "." + (file.name ? file.name.split(".").pop().toLowerCase() : "");
    const mime = file.type ? file.type.toLowerCase() : "";

    const isValid = ASSIGNMENTS_ALLOWED_EXTS.includes(ext) || (mime && ASSIGNMENTS_ALLOWED_MIMES.includes(mime));
    if (!isValid) {
      throw new Error("Invalid file type. Allowed formats: PDF, JPG, JPEG, PNG, DOC, DOCX.");
    }
    return true;
  },

  // Fetch assignments with flexible filtering (department, semester, section, teacher, subject, search)
  async getAssignments(filters = {}) {
    try {
      const snapshot = await window.db.collection("assignments").get();
      let list = [];
      snapshot.docs.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });

      // Filter by teacher
      if (filters.teacherId && filters.teacherId !== "all") {
        list = list.filter(a => a.teacherId === filters.teacherId);
      }

      // Filter by subject
      if (filters.subjectId && filters.subjectId !== "all") {
        list = list.filter(a => a.subjectId === filters.subjectId);
      }

      // Academic audience filtering (Department / Semester / Section)
      // Backward compatibility: If an assignment has no department/semester/section, or is 'all', it matches
      if (filters.department && filters.department !== "all") {
        list = list.filter(a => !a.department || a.department === "all" || a.department === filters.department);
      }
      if (filters.semester && filters.semester !== "all") {
        list = list.filter(a => !a.semester || a.semester === "all" || String(a.semester) === String(filters.semester));
      }
      if (filters.section && filters.section !== "all") {
        list = list.filter(a => !a.section || a.section === "all" || a.section.toUpperCase() === filters.section.toUpperCase());
      }

      // Text search
      if (filters.searchQuery) {
        const q = filters.searchQuery.toLowerCase().trim();
        list = list.filter(a =>
          (a.title && a.title.toLowerCase().includes(q)) ||
          (a.subjectName && a.subjectName.toLowerCase().includes(q)) ||
          (a.description && a.description.toLowerCase().includes(q))
        );
      }

      // Sort by nearest deadline first
      list.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
      return list;
    } catch (error) {
      console.error("[AssignmentsService] Fetch error:", error);
      throw error;
    }
  },

  // Fetch a single assignment by ID
  async getAssignmentById(assignId) {
    try {
      const doc = await window.db.collection("assignments").doc(assignId).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      console.error("[AssignmentsService] getAssignmentById error:", error);
      throw error;
    }
  },

  // Create Assignment (Teacher/Admin) — Attachment is OPTIONAL, uploaded to Supabase
  async createAssignment({
    title,
    department = "all",
    semester = "all",
    section = "all",
    subjectId,
    subjectName,
    description,
    deadline,
    priority = "normal",
    file = null,
    teacherId,
    teacherName
  }) {
    if (!title || !subjectId || !deadline) {
      throw new Error("Title, Subject, and Deadline are required.");
    }
    if (!teacherId) {
      throw new Error("Teacher identity is required.");
    }

    try {
      const assignId = "assign_" + Date.now();
      let storagePath = null;
      let attachmentName = null;

      if (file) {
        this.validateFile(file);
        const safeExt = file.name ? file.name.split(".").pop().toLowerCase() : "pdf";
        storagePath = `assignments/${assignId}/${Date.now()}.${safeExt}`;

        await SupabaseClientService.uploadFile(storagePath, file);
        attachmentName = file.name;
      }

      const record = {
        title: title.trim(),
        department: department || "all",
        semester: semester || "all",
        section: section || "all",
        subjectId,
        subjectName: subjectName || "General",
        teacherId,
        teacherName: teacherName || "Faculty Member",
        description: description ? description.trim() : "",
        deadline,
        priority,
        storagePath,
        attachmentName,
        createdAt: new Date().toISOString()
      };

      await window.db.collection("assignments").doc(assignId).set(record);
      return { id: assignId, ...record };
    } catch (error) {
      console.error("[AssignmentsService] Create error:", error);
      throw error;
    }
  },

  // Edit Assignment (Teacher owns or Admin) — Can update details and optional new attachment
  async editAssignment(assignId, data, newFile = null) {
    try {
      const docRef = window.db.collection("assignments").doc(assignId);
      const existingDoc = await docRef.get();
      if (!existingDoc.exists) throw new Error("Assignment not found.");

      const existingData = existingDoc.data();
      let storagePath = existingData.storagePath || null;
      let attachmentName = existingData.attachmentName || null;

      // Handle replacement file
      if (newFile) {
        this.validateFile(newFile);
        const safeExt = newFile.name ? newFile.name.split(".").pop().toLowerCase() : "pdf";
        const newPath = `assignments/${assignId}/${Date.now()}.${safeExt}`;

        await SupabaseClientService.uploadFile(newPath, newFile);

        // Best effort: delete old file from Supabase if it had one
        if (storagePath) {
          try { await SupabaseClientService.deleteFile(storagePath); } catch (_) {}
        }

        storagePath = newPath;
        attachmentName = newFile.name;
      }

      const updatedRecord = {
        title: data.title ? data.title.trim() : existingData.title,
        department: data.department !== undefined ? data.department : existingData.department,
        semester: data.semester !== undefined ? data.semester : existingData.semester,
        section: data.section !== undefined ? data.section : existingData.section,
        subjectId: data.subjectId || existingData.subjectId,
        subjectName: data.subjectName || existingData.subjectName,
        description: data.description !== undefined ? data.description.trim() : existingData.description,
        deadline: data.deadline || existingData.deadline,
        priority: data.priority || existingData.priority,
        storagePath,
        attachmentName,
        teacherId: existingData.teacherId, // Firestore rule requires teacherId to stay identical
        updatedAt: new Date().toISOString()
      };

      await docRef.update(updatedRecord);
      return { id: assignId, ...existingData, ...updatedRecord };
    } catch (error) {
      console.error("[AssignmentsService] Edit error:", error);
      throw error;
    }
  },

  // Delete Assignment (Teacher owns or Admin)
  async deleteAssignment(assignId) {
    try {
      const docRef = window.db.collection("assignments").doc(assignId);
      const doc = await docRef.get();
      const storagePath = doc.exists ? doc.data().storagePath : null;

      await docRef.delete();

      if (storagePath) {
        try {
          await SupabaseClientService.deleteFile(storagePath);
        } catch (e) {
          console.warn("[AssignmentsService] Storage delete notice:", e);
        }
      }
      return true;
    } catch (error) {
      console.error("[AssignmentsService] Delete error:", error);
      throw error;
    }
  },

  // View Assignment Attachment (handles Supabase signed URL with legacy fallback)
  async viewAttachment(storagePath, fallbackUrl = null) {
    try {
      if (storagePath) {
        return await SupabaseClientService.viewFile(storagePath);
      }
      if (fallbackUrl) {
        window.open(fallbackUrl, "_blank", "noopener,noreferrer");
        return fallbackUrl;
      }
      throw new Error("No attachment associated with this assignment.");
    } catch (error) {
      console.error("[AssignmentsService] View attachment error:", error);
      throw error;
    }
  },

  // Download Assignment Attachment
  async downloadAttachment(storagePath, fileName = "assignment-file", fallbackUrl = null) {
    try {
      if (storagePath) {
        return await SupabaseClientService.downloadFile(storagePath, fileName);
      }
      if (fallbackUrl) {
        const a = document.createElement("a");
        a.href = fallbackUrl;
        a.target = "_blank";
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return true;
      }
      throw new Error("No attachment associated with this assignment.");
    } catch (error) {
      console.error("[AssignmentsService] Download attachment error:", error);
      throw error;
    }
  },

  // Student Submits or Replaces Assignment Solution
  async submitAssignment({ assignmentId, studentId, studentName, studentRoll, file, comment = "" }) {
    if (!file) throw new Error("Please select your submission file to upload.");
    if (!studentId) throw new Error("Student identity is required.");

    this.validateFile(file);

    try {
      // 1. Check assignment deadline & status
      const assign = await this.getAssignmentById(assignmentId);
      if (!assign) throw new Error("Assignment not found.");

      const isOverdue = new Date() > new Date(assign.deadline);
      if (isOverdue) {
        throw new Error("Submission deadline has passed. Submissions are closed for this assignment.");
      }

      // 2. Check if student has already submitted
      const existingSnap = await window.db.collection("submissions")
        .where("assignmentId", "==", assignmentId)
        .where("studentId", "==", studentId)
        .get();

      const existingDoc = !existingSnap.empty ? existingSnap.docs[0] : null;

      // 3. Upload file to Supabase private Storage: submissions/{assignmentId}/{studentId}/{uniqueFileName}
      const safeExt = file.name ? file.name.split(".").pop().toLowerCase() : "pdf";
      const safeFileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const storagePath = `submissions/${assignmentId}/${studentId}/${safeFileName}`;

      await SupabaseClientService.uploadFile(storagePath, file);

      // 4. Update existing doc or create new submission
      if (existingDoc) {
        const oldStoragePath = existingDoc.data().storagePath;

        const updateRecord = {
          fileName: file.name,
          storagePath,
          comment: comment ? comment.trim() : "",
          updatedAt: new Date().toISOString(),
          status: "Submitted",
          studentId, // Ensure studentId matches rule
          studentName: studentName || existingDoc.data().studentName,
          studentRoll: studentRoll || existingDoc.data().studentRoll
        };

        await window.db.collection("submissions").doc(existingDoc.id).update(updateRecord);

        // Delete old file from Supabase if different
        if (oldStoragePath && oldStoragePath !== storagePath) {
          try { await SupabaseClientService.deleteFile(oldStoragePath); } catch (_) {}
        }

        return { id: existingDoc.id, ...existingDoc.data(), ...updateRecord };
      } else {
        const submId = "subm_" + Date.now();
        const submissionRecord = {
          assignmentId,
          studentId,
          studentName: studentName || "Student",
          studentRoll: studentRoll || "",
          fileName: file.name,
          storagePath,
          comment: comment ? comment.trim() : "",
          submittedAt: new Date().toISOString(),
          status: "Submitted"
        };

        await window.db.collection("submissions").doc(submId).set(submissionRecord);
        return { id: submId, ...submissionRecord };
      }
    } catch (error) {
      console.error("[AssignmentsService] Submission error:", error);
      throw error;
    }
  },

  // Fetch all submissions for an assignment (Teacher/Admin view)
  async getSubmissionsForAssignment(assignmentId) {
    try {
      const snapshot = await window.db.collection("submissions")
        .where("assignmentId", "==", assignmentId)
        .get();

      const list = [];
      snapshot.docs.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });

      // Sort newest submission first
      list.sort((a, b) => new Date(b.submittedAt || b.updatedAt || 0) - new Date(a.submittedAt || a.updatedAt || 0));
      return list;
    } catch (error) {
      console.error("[AssignmentsService] Fetch submissions error:", error);
      throw error;
    }
  },

  // View / Download a Student's Submitted Solution File
  async viewSubmission(storagePath, fallbackUrl = null) {
    return this.viewAttachment(storagePath, fallbackUrl);
  },

  async downloadSubmission(storagePath, fileName = "student-solution", fallbackUrl = null) {
    return this.downloadAttachment(storagePath, fileName, fallbackUrl);
  },

  // Get full class roster for an assignment with submitted & pending status
  async getClassRosterWithSubmissions(assignment) {
    try {
      const submissions = await this.getSubmissionsForAssignment(assignment.id);
      const subMap = {};
      submissions.forEach(s => { subMap[s.studentId] = s; });

      // Query student users belonging to assignment's audience
      let query = window.db.collection("users")
        .where("role", "==", "student")
        .where("status", "==", "active");

      if (assignment.department && assignment.department !== "all") {
        query = query.where("department", "==", assignment.department);
      }
      if (assignment.semester && assignment.semester !== "all") {
        query = query.where("semester", "==", String(assignment.semester));
      }
      if (assignment.section && assignment.section !== "all") {
        query = query.where("section", "==", assignment.section);
      }

      const studentsSnap = await query.get();
      const roster = [];

      studentsSnap.docs.forEach(doc => {
        const u = doc.data();
        const sub = subMap[doc.id] || null;
        roster.push({
          studentId: doc.id,
          studentName: u.displayName || u.name || "Student",
          studentRoll: u.studentId || u.rollNumber || "—",
          department: u.department || "",
          semester: u.semester || "",
          section: u.section || "",
          status: sub ? "Submitted" : "Pending",
          submission: sub
        });
      });

      // Also include any submissions whose student record might not match strict filter
      submissions.forEach(sub => {
        if (!roster.some(r => r.studentId === sub.studentId)) {
          roster.push({
            studentId: sub.studentId,
            studentName: sub.studentName || "Student",
            studentRoll: sub.studentRoll || "—",
            department: assignment.department || "",
            semester: assignment.semester || "",
            section: assignment.section || "",
            status: "Submitted",
            submission: sub
          });
        }
      });

      // Sort: submitted first, then alphabetical by student name
      roster.sort((a, b) => {
        if (a.status !== b.status) return a.status === "Submitted" ? -1 : 1;
        return a.studentName.localeCompare(b.studentName);
      });

      return {
        assignment,
        roster,
        submittedCount: roster.filter(r => r.status === "Submitted").length,
        pendingCount: roster.filter(r => r.status === "Pending").length,
        totalCount: roster.length
      };
    } catch (error) {
      console.error("[AssignmentsService] getClassRosterWithSubmissions error:", error);
      throw error;
    }
  },

  // Compute student-specific status for an assignment card
  computeStatus(assignment, studentSubmissions = []) {
    const submission = studentSubmissions.find(s => s.assignmentId === assignment.id);
    if (submission) return { status: "Submitted", submission };

    const deadlineTime = new Date(assignment.deadline).getTime();
    const now = Date.now();
    if (now > deadlineTime) return { status: "Overdue", submission: null };
    return { status: "Pending", submission: null };
  }
};

window.AssignmentsService = AssignmentsService;
