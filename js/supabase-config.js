/**
 * CAMPUSX — SUPABASE CLIENT CONFIGURATION
 * =============================================================================
 * Supabase is used ONLY for file storage (private bucket: campusx-files).
 * Firebase Authentication remains the single source of truth for identity.
 * Firebase Firestore remains authoritative for user roles and metadata.
 *
 * SECURITY NOTES:
 * - Only the Supabase Project URL and Publishable (anon) key are stored here.
 * - NEVER add a service_role / secret key to any frontend file.
 * - Authentication to Supabase is performed via the current Firebase user s
 *   ID token (a signed Firebase JWT), passed as the Authorization Bearer.
 * - Supabase Third-Party Auth with Firebase must already be configured in
 *   the Supabase console (JWT secret set to Firebase project s JWKS URL).
 *
 * HOW IT WORKS:
 * 1. User signs in via Firebase Auth (email/password or Google).
 * 2. SupabaseClientService.getClient() retrieves the current Firebase ID token.
 * 3. A Supabase JS client is instantiated with that token as the access token.
 * 4. All subsequent Supabase Storage API calls carry the Firebase JWT, so
 *    Supabase can verify the caller is a genuine Firebase-authenticated user.
 *
 * NOTE ON ROLE ENFORCEMENT:
 * - The Firebase ID token does NOT contain role/status claims by default.
 * - Therefore Supabase RLS policies cannot distinguish student vs teacher.
 * - Role-based write authorization is enforced by Firestore Security Rules.
 * - A future Cloud Function can set Firebase Custom Claims to enable
 *   fine-grained Supabase RLS policies without any frontend changes.
 * =============================================================================
 */

const SUPABASE_URL = "https://idgcdhjwmvknmnjgjydm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ND28nOHhprhDs62cnqlSdg_yuREQ3yG";
const SUPABASE_BUCKET = "campusx-files";

const SupabaseClientService = (() => {
  let _client = null;
  let _tokenExpiry = 0;

  /**
   * Build and return a Supabase client authenticated with the current
   * Firebase user's ID token.
   */
  async function getClient() {
    const firebaseUser = window.auth ? window.auth.currentUser : null;
    if (!firebaseUser) {
      throw new Error("[Supabase] No authenticated Firebase user. Please sign in first.");
    }

    const now = Date.now();

    // Reuse cached client if the token is still valid (with a 60-second buffer)
    if (_client && _tokenExpiry - now > 60000) {
      return _client;
    }

    // Fetch a fresh Firebase ID token
    let idToken;
    try {
      idToken = await firebaseUser.getIdToken(false);
    } catch (err) {
      console.error("[Supabase] Failed to retrieve Firebase ID token:", err);
      throw new Error("[Supabase] Could not obtain Firebase ID token. Please sign in again.");
    }

    // Decode token expiry from the JWT payload (base64url middle segment)
    try {
      const payloadBase64 = idToken.split(".")[1];
      const payload = JSON.parse(atob(payloadBase64.replace(/-/g, "+").replace(/_/g, "/")));
      _tokenExpiry = (payload.exp || 0) * 1000;
    } catch (_) {
      _tokenExpiry = now + 55 * 60 * 1000;
    }

    if (typeof supabase === "undefined" || !supabase.createClient) {
      throw new Error("[Supabase] Supabase JS SDK is not loaded. Please ensure supabase.min.js is included.");
    }

    // Create Supabase client with the Firebase JWT as the access token
    _client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionFromUrl: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      },
    });

    console.log("[Supabase] Client initialised with Firebase JWT (uid:", firebaseUser.uid, ")");
    return _client;
  }

  /**
   * Invalidate the cached client.
   * Call on Firebase auth state changes so the next getClient() gets a fresh token.
   */
  function invalidate() {
    _client = null;
    _tokenExpiry = 0;
  }

  const MIME_TYPES = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  };

  const ALLOWED_MIME_LIST = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ];

  /**
   * Upload a file to Supabase Storage (campusx-files bucket).
   * Validates supported formats (PDF, JPG, JPEG, PNG, DOC, DOCX) and <= 25 MB limit.
   */
  async function uploadFile(path, file) {
    if (!file) throw new Error("No file provided for upload.");

    const ext = "." + (file.name ? file.name.split(".").pop().toLowerCase() : "");
    const mappedMime = MIME_TYPES[ext];
    const fileMime = file.type ? file.type.toLowerCase() : "";

    const isValidType = !!mappedMime && (
      !fileMime ||
      fileMime === mappedMime ||
      ALLOWED_MIME_LIST.includes(fileMime) ||
      (ext === ".jpg" && fileMime === "image/jpeg") ||
      (ext === ".jpeg" && fileMime === "image/jpeg")
    );

    if (!isValidType) {
      throw new Error("Unsupported file format. Allowed formats: PDF, JPG, JPEG, PNG, DOC, DOCX.");
    }
    if (file.size > 25 * 1024 * 1024) {
      throw new Error("File exceeds the 25 MB maximum limit.");
    }

    const contentType = mappedMime || fileMime || "application/octet-stream";

    const client = await getClient();
    const { data, error } = await client.storage
      .from(SUPABASE_BUCKET)
      .upload(path, file, {
        contentType: contentType,
        upsert: false,
      });

    if (error) {
      console.error("[Supabase] Upload error:", error);
      throw error;
    }
    return data;
  }

  /**
   * Create a time-limited signed URL for viewing private files.
   * Default expiration: 60 seconds.
   */
  async function createSignedUrl(path, expiresInSeconds = 60) {
    if (!path) throw new Error("File path is required.");
    const client = await getClient();
    const { data, error } = await client.storage
      .from(SUPABASE_BUCKET)
      .createSignedUrl(path, expiresInSeconds);

    if (error) {
      console.error("[Supabase] Create signed URL error:", error);
      throw error;
    }
    return data.signedUrl;
  }

  /**
   * Securely view a PDF in a new browser tab via a temporary signed URL.
   * Pre-opens window synchronously to prevent browser popup blockers.
   */
  async function viewFile(path) {
    if (!path) throw new Error("File path is required.");
    let win = null;
    try {
      win = window.open("", "_blank");
    } catch (_) {}

    try {
      const signedUrl = await createSignedUrl(path, 60);
      if (win && !win.closed) {
        win.location.href = signedUrl;
      } else {
        window.open(signedUrl, "_blank", "noopener,noreferrer");
      }
      return signedUrl;
    } catch (err) {
      if (win && !win.closed) win.close();
      throw err;
    }
  }

  /**
   * Download a private file directly as a Blob using the authenticated client.
   * Revokes the local Object URL immediately after triggering the download.
   */
  async function downloadFile(path, fileName = "document.pdf") {
    if (!path) throw new Error("File path is required.");
    const client = await getClient();
    const { data, error } = await client.storage
      .from(SUPABASE_BUCKET)
      .download(path);

    if (error) {
      console.error("[Supabase] Download error:", error);
      throw error;
    }

    const blobUrl = window.URL.createObjectURL(data);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    }, 1000);
    return true;
  }

  /**
   * Delete a file from the private Supabase bucket.
   */
  async function deleteFile(path) {
    if (!path) return;
    const client = await getClient();
    const { data, error } = await client.storage
      .from(SUPABASE_BUCKET)
      .remove([path]);

    if (error) {
      console.error("[Supabase] Delete error:", error);
      throw error;
    }
    return data;
  }

  /**
   * Test the connection: verify that the Firebase JWT is accepted by Supabase.
   * Lists up to 5 entries from the campusx-files bucket root.
   */
  async function testConnection() {
    try {
      const client = await getClient();

      const { data, error } = await client.storage.from(SUPABASE_BUCKET).list("", {
        limit: 5,
        offset: 0,
      });

      if (error) {
        console.error("[Supabase] Connection test FAILED:", error);
        return {
          success: false,
          message: "Supabase connection failed: " + error.message,
          error,
        };
      }

      console.log("[Supabase] Connection test PASSED. Bucket listing:", data);
      return {
        success: true,
        message: "Supabase client connected successfully using Firebase JWT.",
        data,
      };
    } catch (err) {
      console.error("[Supabase] Connection test error:", err);
      return {
        success: false,
        message: err.message || "Unknown error during Supabase connection test.",
        error: err,
      };
    }
  }

  // Invalidate client on Firebase auth state change
  if (window.auth) {
    window.auth.onAuthStateChanged(() => invalidate());
  } else {
    window.addEventListener("load", () => {
      if (window.auth) {
        window.auth.onAuthStateChanged(() => invalidate());
      }
    });
  }

  return {
    BUCKET: SUPABASE_BUCKET,
    getClient,
    invalidate,
    uploadFile,
    createSignedUrl,
    viewFile,
    downloadFile,
    deleteFile,
    testConnection,
  };
})();

window.SupabaseClientService = SupabaseClientService;
