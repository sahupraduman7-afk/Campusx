/**
 * CAMPUSX — CIRCULARS MODULE
 * Official administrative notifications with optional file attachments.
 * Attachments are stored in Supabase Storage (private bucket) — no public URLs.
 */

const CIRCULARS_ALLOWED_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
const CIRCULARS_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

const CircularsService = {
  // Validate file before upload
  validateFile(file) {
    if (!file) return null;
    if (file.size > CIRCULARS_MAX_BYTES) {
      throw new Error(`File is too large. Maximum allowed size is 25 MB.`);
    }
    if (!CIRCULARS_ALLOWED_MIMES.includes(file.type)) {
      throw new Error(`Invalid file type. Allowed: PDF, JPG, PNG, DOC, DOCX.`);
    }
    return true;
  },

  // Fetch Circulars (sorted newest first by date)
  async getCirculars() {
    try {
      const snapshot = await window.db.collection('circulars').get();
      let list = [];
      snapshot.docs.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      return list;
    } catch (error) {
      console.error('[CircularsService] Fetch error:', error);
      throw error;
    }
  },

  // Publish Circular — Attachment is OPTIONAL, uploaded to Supabase
  async publishCircular({ title, description, department = 'Campus Wide', date, file, issuedBy }) {
    if (!title || !description) throw new Error('Title and Description are required.');

    try {
      const circId = 'circ_' + Date.now();
      let attachmentName = null;
      let storagePath = null;

      if (file) {
        this.validateFile(file);
        const ext = file.name.split('.').pop();
        const safeName = `${circId}.${ext}`;
        storagePath = `circulars/${safeName}`;

        const supa = await SupabaseClientService.getClient();
        const { error: uploadError } = await supa.storage
          .from(SupabaseClientService.BUCKET)
          .upload(storagePath, file, { contentType: file.type, upsert: false });

        if (uploadError) throw new Error('File upload failed: ' + uploadError.message);
        attachmentName = file.name;
      }

      const circularRecord = {
        title,
        description,
        department,
        issuedBy: issuedBy || 'Office of the Dean',
        date: date || new Date().toISOString().split('T')[0],
        attachmentName,
        storagePath,
        createdAt: new Date().toISOString()
      };

      await window.db.collection('circulars').doc(circId).set(circularRecord);
      return { id: circId, ...circularRecord };
    } catch (error) {
      console.error('[CircularsService] Publish circular error:', error);
      throw error;
    }
  },

  // View attachment in a new tab (authenticated signed URL)
  async viewAttachment(circId) {
    try {
      const doc = await window.db.collection('circulars').doc(circId).get();
      if (!doc.exists) throw new Error('Circular not found.');
      const { storagePath } = doc.data();
      if (!storagePath) throw new Error('No attachment on this circular.');
      await SupabaseClientService.viewFile(storagePath);
    } catch (error) {
      console.error('[CircularsService] View error:', error);
      throw error;
    }
  },

  // Download attachment as a blob
  async downloadAttachment(circId) {
    try {
      const doc = await window.db.collection('circulars').doc(circId).get();
      if (!doc.exists) throw new Error('Circular not found.');
      const { storagePath, attachmentName } = doc.data();
      if (!storagePath) throw new Error('No attachment on this circular.');
      await SupabaseClientService.downloadFile(storagePath, attachmentName || 'circular-attachment');
    } catch (error) {
      console.error('[CircularsService] Download error:', error);
      throw error;
    }
  },

  // Delete Circular + Supabase file
  async deleteCircular(circId) {
    try {
      const doc = await window.db.collection('circulars').doc(circId).get();
      const storagePath = doc.exists ? doc.data().storagePath : null;

      await window.db.collection('circulars').doc(circId).delete();

      if (storagePath) {
        try { await SupabaseClientService.deleteFile(storagePath); } catch (e) {
          console.warn('[CircularsService] Supabase file delete failed (may already be gone):', e);
        }
      }
      return true;
    } catch (error) {
      console.error('[CircularsService] Delete error:', error);
      throw error;
    }
  }
};

window.CircularsService = CircularsService;
