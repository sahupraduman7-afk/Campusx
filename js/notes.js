/**
 * CAMPUSX — STUDY NOTES MODULE
 * Supabase Storage (private bucket: campusx-files) + Cloud Firestore metadata.
 * Strictly enforces PDF documents (<= 25 MB) with authenticated view and download.
 */

const NotesService = {
  // Permitted file types for notes: PDF, JPG, JPEG, PNG, DOC, DOCX
  ALLOWED_EXTENSIONS: [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"],
  MIME_TYPES: {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  },
  ALLOWED_MIMES: [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ],
  MAX_FILE_SIZE: 25 * 1024 * 1024, // 25 MB
  _notesCache: new Map(),

  // Validate File: PDF, JPG, JPEG, PNG, DOC, DOCX <= 25 MB
  validateFile(file) {
    if (!file) throw new Error("A document file is required for notes.");
    const ext = "." + (file.name ? file.name.split(".").pop().toLowerCase() : "");
    const fileMime = file.type ? file.type.toLowerCase() : "";
    const isAllowedExt = this.ALLOWED_EXTENSIONS.includes(ext);
    const isAllowedMime = !fileMime || this.ALLOWED_MIMES.includes(fileMime);

    if (!isAllowedExt || !isAllowedMime) {
      throw new Error("Unsupported file format. Permitted formats: PDF, JPG, JPEG, PNG, DOC, DOCX (Max 25MB).");
    }
    if (file.size > this.MAX_FILE_SIZE) {
      throw new Error("File size exceeds the 25 MB maximum limit.");
    }
    return true;
  },

  // Fetch All Notes from Firestore & cache them
  async getNotes(filters = {}) {
    try {
      const snapshot = await window.db.collection("notes").get();
      let notes = [];
      snapshot.docs.forEach(doc => {
        const item = { id: doc.id, ...doc.data() };
        this._notesCache.set(doc.id, item);
        notes.push(item);
      });

      // Client-side search and filtering
      if (filters.subjectId && filters.subjectId !== "all") {
        notes = notes.filter(n => n.subjectId === filters.subjectId);
      }
      if (filters.teacherId && filters.teacherId !== "all") {
        notes = notes.filter(n => n.teacherId === filters.teacherId);
      }
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase().trim();
        notes = notes.filter(n => 
          (n.title && n.title.toLowerCase().includes(query)) ||
          (n.description && n.description.toLowerCase().includes(query)) ||
          (n.subjectName && n.subjectName.toLowerCase().includes(query)) ||
          (n.teacherName && n.teacherName.toLowerCase().includes(query))
        );
      }

      // Sort by newest first
      notes.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      return notes;
    } catch (error) {
      console.error("[NotesService] Error fetching notes:", error);
      throw error;
    }
  },

  // Retrieve a single note from cache or Firestore
  async getNoteById(id) {
    if (this._notesCache.has(id)) {
      return this._notesCache.get(id);
    }
    const doc = await window.db.collection("notes").doc(id).get();
    if (!doc.exists) return null;
    const note = { id: doc.id, ...doc.data() };
    this._notesCache.set(id, note);
    return note;
  },

  // Upload Note: PDF binary -> Supabase Storage, Metadata -> Cloud Firestore
  async uploadNote({ title, subjectId, subjectName, description, file, teacherId, teacherName, onProgress }) {
    if (!title || !subjectId) throw new Error("Please provide title and subject.");
    this.validateFile(file);

    try {
      const noteId = "note_" + Date.now();
      const cleanFileName = (file.name || "note.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `notes/${noteId}/${cleanFileName}`;

      if (onProgress) onProgress(20);

      // Upload binary to Supabase Storage (campusx-files)
      await SupabaseClientService.uploadFile(storagePath, file);

      if (onProgress) onProgress(75);

      // Create Firestore note document
      // Note: No public fileUrl is saved — access is gated through authenticated Supabase client
      const noteRecord = {
        title: title.trim(),
        subjectId,
        subjectName: subjectName || "General",
        teacherId,
        teacherName: teacherName || "Faculty Member",
        description: (description || "").trim(),
        fileName: file.name,
        fileUrl: null,
        storageBucket: "campusx-files",
        storagePath,
        fileType: (file.name && this.MIME_TYPES["." + file.name.split(".").pop().toLowerCase()]) || file.type || "application/octet-stream",
        fileSize: typeof formatFileSize === "function" ? formatFileSize(file.size) : `${Math.round(file.size / 1024)} KB`,
        createdAt: new Date().toISOString()
      };

      await window.db.collection("notes").doc(noteId).set(noteRecord);

      if (onProgress) onProgress(100);

      const created = { id: noteId, ...noteRecord };
      this._notesCache.set(noteId, created);
      return created;
    } catch (error) {
      console.error("[NotesService] Upload error:", error);
      throw error;
    }
  },

  // Authenticated View: Generates short-lived signed URL and opens in browser
  async viewNote(noteOrId) {
    try {
      const note = typeof noteOrId === "object" ? noteOrId : await this.getNoteById(noteOrId);
      if (!note) throw new Error("Note record not found.");

      if (note.storagePath) {
        // Private Supabase Storage via signed URL
        await SupabaseClientService.viewFile(note.storagePath);
      } else if (note.fileUrl) {
        // Legacy fallback
        window.open(note.fileUrl, "_blank", "noopener,noreferrer");
      } else {
        throw new Error("No document path available for this note.");
      }
    } catch (err) {
      console.error("[NotesService] View error:", err);
      if (typeof showToast === "function") {
        showToast(err.message || "Failed to open document", "danger");
      } else {
        alert(err.message || "Failed to open document");
      }
    }
  },

  // Authenticated Download: Streams blob through authenticated client
  async downloadNote(noteOrId) {
    try {
      const note = typeof noteOrId === "object" ? noteOrId : await this.getNoteById(noteOrId);
      if (!note) throw new Error("Note record not found.");

      const downloadName = note.fileName || (note.title ? `${note.title}.pdf` : "note.pdf");

      if (note.storagePath) {
        if (typeof showToast === "function") showToast("Preparing secure download...", "info");
        await SupabaseClientService.downloadFile(note.storagePath, downloadName);
      } else if (note.fileUrl) {
        // Legacy fallback
        const a = document.createElement("a");
        a.href = note.fileUrl;
        a.download = downloadName;
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        throw new Error("No document file available for download.");
      }
    } catch (err) {
      console.error("[NotesService] Download error:", err);
      if (typeof showToast === "function") {
        showToast(err.message || "Failed to download document", "danger");
      } else {
        alert(err.message || "Failed to download document");
      }
    }
  },

  // Delete Note and Associated Storage File
  async deleteNote(noteId, storagePath) {
    try {
      // 1. Delete from Firestore
      await window.db.collection("notes").doc(noteId).delete();

      // 2. Delete binary from Supabase Storage if path exists
      if (storagePath) {
        try {
          await SupabaseClientService.deleteFile(storagePath);
        } catch (storageErr) {
          console.warn("[NotesService] Could not remove file from Supabase storage:", storageErr);
          // Legacy Firebase storage fallback
          if (window.storage) {
            try { await window.storage.ref(storagePath).delete(); } catch (_) {}
          }
        }
      }
      this._notesCache.delete(noteId);
      return true;
    } catch (error) {
      console.error("[NotesService] Delete note error:", error);
      throw error;
    }
  },

  // Render Note Card for Students
  renderNoteCard(note) {
    const ext = (note.fileName ? note.fileName.split(".").pop().toUpperCase() : "DOC");
    const badgeColor = ext === "PDF" 
      ? "badge-danger" 
      : (["JPG", "JPEG", "PNG"].includes(ext) ? "badge-warning" : "badge-primary");

    return `
      <div class="card card-hover" style="display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 0.75rem;">
            <span class="badge ${badgeColor}">${ext}</span>
            <span class="text-xs text-muted">${formatDate(note.createdAt)}</span>
          </div>
          <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 0.5rem; line-height: 1.35;">${sanitizeHtml(note.title)}</h3>
          <p class="text-sm font-semibold text-primary" style="margin-bottom: 0.5rem;">${sanitizeHtml(note.subjectName)}</p>
          <p class="text-sm text-muted" style="line-height: 1.45; margin-bottom: 1rem;">${sanitizeHtml(note.description || "No description provided.")}</p>
        </div>

        <div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--border-light); font-size: 0.8125rem;">
            <span class="text-muted">By: <strong>${sanitizeHtml(note.teacherName)}</strong></span>
            <span class="text-muted">${sanitizeHtml(note.fileSize || "")}</span>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button type="button" onclick="NotesService.viewNote('${note.id}')" class="btn btn-outline btn-sm w-full">
              👁️ View
            </button>
            <button type="button" onclick="NotesService.downloadNote('${note.id}')" class="btn btn-primary btn-sm w-full">
              ⬇️ Download
            </button>
          </div>
        </div>
      </div>
    `;
  }
};

window.NotesService = NotesService;
