/**
 * CAMPUSX — NOTICES MODULE
 * Publish announcements with optional attachments, priority badges, and department filtering.
 * Attachments are stored in Supabase Storage (private bucket) — no public URLs.
 */

const NOTICES_ALLOWED_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
const NOTICES_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

const NoticesService = {
  // Validate file before upload
  validateFile(file) {
    if (!file) return null;
    if (file.size > NOTICES_MAX_BYTES) {
      throw new Error(`File is too large. Maximum allowed size is 25 MB.`);
    }
    if (!NOTICES_ALLOWED_MIMES.includes(file.type)) {
      throw new Error(`Invalid file type. Allowed: PDF, JPG, PNG, DOC, DOCX.`);
    }
    return true;
  },

  // Fetch Notices (optionally filter by departmentId)
  async getNotices(departmentId = 'all') {
    try {
      const snapshot = await window.db.collection('notices').get();
      let list = [];
      snapshot.docs.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });

      // Filter by department if not "all"
      if (departmentId && departmentId !== 'all') {
        list = list.filter(n => n.departmentId === departmentId || n.departmentId === 'all');
      }

      // Sort by newest
      list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      return list;
    } catch (error) {
      console.error('[NoticesService] Fetch error:', error);
      throw error;
    }
  },

  // Publish Notice (Teacher/Admin) — Attachment is OPTIONAL, uploaded to Supabase
  async publishNotice({ title, description, departmentId, departmentName, priority = 'normal', file, createdBy }) {
    if (!title || !description) throw new Error('Title and Description are required.');

    try {
      const noticeId = 'notice_' + Date.now();
      let attachmentName = null;
      let storagePath = null;

      // Optional file attachment — Supabase Storage
      if (file) {
        this.validateFile(file);
        const ext = file.name.split('.').pop();
        const safeName = `${noticeId}.${ext}`;
        storagePath = `notices/${safeName}`;

        const supa = await SupabaseClientService.getClient();
        const { error: uploadError } = await supa.storage
          .from(SupabaseClientService.BUCKET)
          .upload(storagePath, file, { contentType: file.type, upsert: false });

        if (uploadError) throw new Error('File upload failed: ' + uploadError.message);
        attachmentName = file.name;
      }

      const noticeRecord = {
        title,
        description,
        departmentId: departmentId || 'all',
        departmentName: departmentName || 'All Departments',
        priority,
        attachmentName,
        storagePath,
        createdBy: createdBy || 'Administration',
        createdAt: new Date().toISOString()
      };

      await window.db.collection('notices').doc(noticeId).set(noticeRecord);
      return { id: noticeId, ...noticeRecord };
    } catch (error) {
      console.error('[NoticesService] Publish error:', error);
      throw error;
    }
  },

  // View attachment in a new tab (authenticated signed URL)
  async viewAttachment(noticeId) {
    try {
      const doc = await window.db.collection('notices').doc(noticeId).get();
      if (!doc.exists) throw new Error('Notice not found.');
      const { storagePath } = doc.data();
      if (!storagePath) throw new Error('No attachment on this notice.');
      await SupabaseClientService.viewFile(storagePath);
    } catch (error) {
      console.error('[NoticesService] View error:', error);
      throw error;
    }
  },

  // Download attachment as a blob
  async downloadAttachment(noticeId) {
    try {
      const doc = await window.db.collection('notices').doc(noticeId).get();
      if (!doc.exists) throw new Error('Notice not found.');
      const { storagePath, attachmentName } = doc.data();
      if (!storagePath) throw new Error('No attachment on this notice.');
      await SupabaseClientService.downloadFile(storagePath, attachmentName || 'notice-attachment');
    } catch (error) {
      console.error('[NoticesService] Download error:', error);
      throw error;
    }
  },

  // Delete Notice + Supabase file
  async deleteNotice(noticeId) {
    try {
      const doc = await window.db.collection('notices').doc(noticeId).get();
      const storagePath = doc.exists ? doc.data().storagePath : null;

      await window.db.collection('notices').doc(noticeId).delete();

      if (storagePath) {
        try { await SupabaseClientService.deleteFile(storagePath); } catch (e) {
          console.warn('[NoticesService] Supabase file delete failed (may already be gone):', e);
        }
      }
      return true;
    } catch (error) {
      console.error('[NoticesService] Delete error:', error);
      throw error;
    }
  }
};

window.NoticesService = NoticesService;
