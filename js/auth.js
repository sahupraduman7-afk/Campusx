/**
 * CAMPUSX — AUTHENTICATION SERVICE
 * Manages Login, Registration, Logout, Role Detection, and Password Reset.
 */

const AuthService = {
  // Login with Email & Password
  async login(email, password) {
    if (!email || !password) {
      throw new Error("Please enter both email and password.");
    }

    try {
      const userCredential = await window.auth.signInWithEmailAndPassword(email, password);
      const user = userCredential.user;

      // Fetch user profile from Firestore users collection
      const userDoc = await window.db.collection("users").doc(user.uid).get();
      let profile = userDoc.exists ? userDoc.data() : null;

      if (!profile) {
        // Fallback profile if user was created directly in auth
        profile = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || user.email.split("@")[0],
          role: "student",
          status: "active"
        };
      } else if (!profile.status) {
        profile.status = "active";
      }

      // Check if user is suspended
      if (profile.status === "suspended") {
        await window.auth.signOut();
        sessionStorage.removeItem("campusx_user_profile");
        throw new Error("Your account has been suspended by an administrator. Please contact support.");
      }

      // Store active profile in session
      sessionStorage.setItem("campusx_user_profile", JSON.stringify(profile));
      return profile;
    } catch (error) {
      console.error("[Auth] Login error:", error);
      let message = "Failed to sign in. Please check your credentials.";
      if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password") {
        message = "Invalid email or password.";
      } else if (error.code === "auth/too-many-requests") {
        message = "Too many failed attempts. Please try again later.";
      } else if (error.message) {
        message = error.message;
      }
      throw new Error(message);
    }
  },

  // Register New User (Student or Teacher)
  async register(data) {
    const { email, password, fullName, role, department, studentId, semester } = data;

    if (!email || !password || !fullName) {
      throw new Error("Please complete all required fields.");
    }
    if (password.length < 6) {
      throw new Error("Password must be at least 6 characters.");
    }

    // Role can only be student or teacher from public registration (never admin)
    const cleanRole = (role === "teacher") ? "teacher" : "student";
    // Teachers require admin approval (pending), students are active immediately
    const initialStatus = (cleanRole === "teacher") ? "pending" : "active";

    try {
      const userCredential = await window.auth.createUserWithEmailAndPassword(email, password);
      const user = userCredential.user;

      const profile = {
        uid: user.uid,
        email: email.toLowerCase(),
        displayName: fullName,
        role: cleanRole,
        status: initialStatus,
        department: department || "Computer Science & Engineering",
        studentId: cleanRole === "student" ? (studentId || "") : "",
        semester: cleanRole === "student" ? (semester || "1") : "",
        avatar: fullName.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2),
        createdAt: new Date().toISOString()
      };

      // Store in Firestore users collection
      await window.db.collection("users").doc(user.uid).set(profile);
      sessionStorage.setItem("campusx_user_profile", JSON.stringify(profile));

      // Send Firebase Email Verification
      try {
        await user.sendEmailVerification();
      } catch (verifyErr) {
        console.warn("[Auth] Email verification could not be dispatched immediately:", verifyErr);
      }

      return profile;
    } catch (error) {
      console.error("[Auth] Registration error:", error);
      let message = "Unable to create account.";
      if (error.code === "auth/email-already-in-use") {
        message = "An account with this email already exists.";
      } else if (error.message) {
        message = error.message;
      }
      throw new Error(message);
    }
  },

  // Sign In with Google
  // preferredRole: optional ('student' | 'teacher')
  // onNewUserCallback: optional async callback returning 'student' | 'teacher' when first time
  async signInWithGoogle(preferredRole = null, onNewUserCallback = null) {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await window.auth.signInWithPopup(provider);
      const user = result.user;

      // Check if user profile already exists in Firestore
      const userDoc = await window.db.collection("users").doc(user.uid).get();
      let profile = userDoc.exists ? userDoc.data() : null;

      if (!profile) {
        // New Google user — determine role safely
        let assignedRole = preferredRole;
        if (!assignedRole && typeof onNewUserCallback === "function") {
          assignedRole = await onNewUserCallback(user);
        }
        // Strict fallback to student
        if (assignedRole !== "teacher" && assignedRole !== "student") {
          assignedRole = "student";
        }

        // Never allow admin from public Google sign-in
        const cleanRole = assignedRole === "teacher" ? "teacher" : "student";
        const initialStatus = cleanRole === "teacher" ? "pending" : "active";

        profile = {
          uid: user.uid,
          email: (user.email || "").toLowerCase(),
          displayName: user.displayName || (user.email ? user.email.split("@")[0] : "CampusX User"),
          role: cleanRole,
          status: initialStatus,
          department: "Computer Science & Engineering",
          studentId: "",
          semester: cleanRole === "student" ? "1" : "",
          avatar: (user.displayName || "CX").split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2),
          createdAt: new Date().toISOString()
        };

        // Store in Firestore users collection
        await window.db.collection("users").doc(user.uid).set(profile);
      } else if (!profile.status) {
        profile.status = "active";
      }

      // Check if user is suspended
      if (profile.status === "suspended") {
        await window.auth.signOut();
        sessionStorage.removeItem("campusx_user_profile");
        throw new Error("Your account has been suspended by an administrator. Please contact support.");
      }

      // Store active profile in session
      sessionStorage.setItem("campusx_user_profile", JSON.stringify(profile));
      return profile;
    } catch (error) {
      console.error("[Auth] Google Sign-In error:", error);
      if (error.code === "auth/popup-closed-by-user") {
        throw new Error("Google sign-in was cancelled.");
      } else if (error.code === "auth/popup-blocked") {
        throw new Error("Sign-in popup was blocked by your browser. Please allow popups for this site.");
      } else if (error.code === "auth/account-exists-with-different-credential") {
        throw new Error("An account already exists with this email under a different sign-in method.");
      }
      throw new Error(error.message || "Failed to sign in with Google.");
    }
  },

  // Password Reset with comprehensive error mapping
  async sendPasswordReset(email) {
    if (!email) throw new Error("Please enter your email address.");
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      throw new Error("Please enter a valid email address.");
    }

    try {
      await window.auth.sendPasswordResetEmail(email.trim());
      return true;
    } catch (error) {
      console.error("[Auth] Password reset error:", error);
      let message = "Failed to send reset email. Please try again.";
      if (error.code === "auth/user-not-found") {
        message = "No account found with this email address.";
      } else if (error.code === "auth/invalid-email") {
        message = "Please enter a valid email address.";
      } else if (error.code === "auth/too-many-requests") {
        message = "Too many reset attempts. Please wait a few minutes before trying again.";
      } else if (error.code === "auth/network-request-failed") {
        message = "Network error. Please check your internet connection.";
      } else if (error.message) {
        message = error.message;
      }
      throw new Error(message);
    }
  },

  // Resend Email Verification link to currently signed-in user
  async resendVerificationEmail() {
    const user = window.auth.currentUser;
    if (!user) {
      throw new Error("No active session found. Please sign in first.");
    }
    if (user.emailVerified) {
      throw new Error("Your email address is already verified!");
    }
    try {
      await user.sendEmailVerification();
      return true;
    } catch (error) {
      console.error("[Auth] Resend verification error:", error);
      if (error.code === "auth/too-many-requests") {
        throw new Error("Too many requests. Please wait a few minutes before requesting another verification email.");
      }
      throw new Error(error.message || "Failed to resend verification email.");
    }
  },

  // Check if current authenticated user has a verified email
  isEmailVerified() {
    const user = window.auth ? window.auth.currentUser : null;
    return user ? !!user.emailVerified : false;
  },

  // Sign Out
  async logout() {
    try {
      await window.auth.signOut();
      sessionStorage.removeItem("campusx_user_profile");
      // Compute relative path to root login
      const isSubDir = window.location.pathname.includes("/student/") || 
                        window.location.pathname.includes("/teacher/") || 
                        window.location.pathname.includes("/admin/");
      window.location.href = isSubDir ? "../login.html" : "login.html";
    } catch (error) {
      console.error("[Auth] Sign out error:", error);
    }
  },

  // Get Current Cached Profile
  getCurrentProfile() {
    const raw = sessionStorage.getItem("campusx_user_profile");
    if (raw) {
      try { return JSON.parse(raw); } catch (e) { }
    }
    const current = window.auth ? window.auth.currentUser : null;
    return current;
  },

  // Route user to appropriate portal based on role
  redirectToRoleDashboard(role) {
    const isSubDir = window.location.pathname.includes("/student/") || 
                      window.location.pathname.includes("/teacher/") || 
                      window.location.pathname.includes("/admin/");
    const prefix = isSubDir ? "../" : "";

    switch (role) {
      case "teacher":
        window.location.href = `${prefix}teacher/dashboard.html`;
        break;
      case "admin":
        window.location.href = `${prefix}admin/dashboard.html`;
        break;
      case "student":
      default:
        window.location.href = `${prefix}student/dashboard.html`;
        break;
    }
  }
};

window.AuthService = AuthService;
