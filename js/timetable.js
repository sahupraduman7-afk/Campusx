/**
 * CAMPUSX — TIMETABLE & CLASS SCHEDULE MODULE
 * Multi-section weekly recurring schedules, time conflict detection,
 * teacher allocation check, and live/upcoming class calculation.
 *
 * Firestore document structure:
 *   timetable/{entryId}
 *     department   : string  — e.g. "Computer Science & Engineering"
 *     semester     : string  — "1" to "8"
 *     section      : string  — "A", "B", "C", "D"
 *     academicYear : string  — e.g. "2024-25"
 *     day          : string  — "Monday" ... "Sunday"
 *     startTime    : string  — "09:00"
 *     endTime      : string  — "10:00"
 *     subjectId    : string  — subject ID (e.g. "CS305")
 *     subjectName  : string  — "Compiler Design"
 *     subject      : string  — mirrored for backward compatibility
 *     teacherId    : string  — teacher UID
 *     teacherName  : string  — teacher display name
 *     room         : string  — room number / lab
 *     type         : string  — "Lecture" | "Lab" | "Tutorial"
 *     notes        : string  — optional notes
 *     createdBy    : string  — admin UID
 *     createdAt    : timestamp
 *     updatedAt    : timestamp
 */

const TimetableService = {

  DAYS: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],

  // ── Helper: Time conversion ──────────────────────────────────────────────

  /** Convert "HH:MM" string to minutes from midnight (0 - 1439). */
  timeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== "string") return 0;
    const [h, m] = timeStr.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  },

  // ── Fetch ────────────────────────────────────────────────────────────────

  /** Fetch all timetable entries (admin view). */
  async getAll() {
    try {
      const snapshot = await window.db.collection("timetable").get();
      const entries = [];
      snapshot.docs.forEach(doc => {
        const d = doc.data();
        entries.push({
          id: doc.id,
          ...d,
          subject: d.subject || d.subjectName || "Subject",
          subjectName: d.subjectName || d.subject || "Subject"
        });
      });
      return entries;
    } catch (error) {
      console.error("[TimetableService] getAll error:", error);
      throw error;
    }
  },

  /** Fetch entries for a specific department + semester + section + academic year. */
  async getForClass({ department, semester, section, academicYear }) {
    try {
      let query = window.db.collection("timetable");
      if (department)   query = query.where("department", "==", department);
      if (semester)     query = query.where("semester", "==", String(semester));
      if (section)      query = query.where("section", "==", section);
      if (academicYear) query = query.where("academicYear", "==", academicYear);
      const snapshot = await query.get();
      const entries = [];
      snapshot.docs.forEach(doc => {
        const d = doc.data();
        entries.push({
          id: doc.id,
          ...d,
          subject: d.subject || d.subjectName || "Subject",
          subjectName: d.subjectName || d.subject || "Subject"
        });
      });
      return entries;
    } catch (error) {
      console.error("[TimetableService] getForClass error:", error);
      throw error;
    }
  },

  /** Fetch entries for a specific teacher (teacher self-view). */
  async getForTeacher(teacherId) {
    try {
      const snapshot = await window.db.collection("timetable")
        .where("teacherId", "==", teacherId)
        .get();
      const entries = [];
      snapshot.docs.forEach(doc => {
        const d = doc.data();
        entries.push({
          id: doc.id,
          ...d,
          subject: d.subject || d.subjectName || "Subject",
          subjectName: d.subjectName || d.subject || "Subject"
        });
      });
      return entries;
    } catch (error) {
      console.error("[TimetableService] getForTeacher error:", error);
      throw error;
    }
  },

  // ── Conflict Detection ───────────────────────────────────────────────────

  /**
   * Validate that time window is valid and there are no overlapping classes:
   * 1. Class conflict: Same Department, Semester, Section, Day cannot have overlapping classes.
   * 2. Teacher conflict: Same Teacher cannot be assigned to two classes at the same time.
   */
  async checkConflict({ department, semester, section, day, startTime, endTime, teacherId, academicYear, excludeId = null }) {
    const newStart = this.timeToMinutes(startTime);
    const newEnd   = this.timeToMinutes(endTime);

    if (newEnd <= newStart) {
      return {
        conflict: true,
        message: "End time must be after start time."
      };
    }

    try {
      // Query entries on the same day for conflict inspection
      const snap = await window.db.collection("timetable")
        .where("day", "==", day)
        .get();

      for (const doc of snap.docs) {
        if (excludeId && doc.id === excludeId) continue;
        const entry = doc.data();

        const exStart = this.timeToMinutes(entry.startTime);
        const exEnd   = this.timeToMinutes(entry.endTime);

        // Check if time intervals overlap
        const overlaps = (newStart < exEnd && newEnd > exStart);
        if (!overlaps) continue;

        // 1. Section conflict check
        const sameDept = (!department || !entry.department || department === entry.department);
        const sameSem  = (!semester || !entry.semester || String(semester) === String(entry.semester));
        const sameSec  = (!section || !entry.section || section.toUpperCase() === (entry.section || "").toUpperCase());
        const sameYear = (!academicYear || !entry.academicYear || academicYear === entry.academicYear);

        if (sameDept && sameSem && sameSec && sameYear) {
          const subTitle = entry.subjectName || entry.subject || "Class";
          return {
            conflict: true,
            type: "class",
            message: `Time conflict: Another class (${subTitle}) is already scheduled for this class section from ${entry.startTime} to ${entry.endTime}.`,
            conflictingEntry: { id: doc.id, ...entry }
          };
        }

        // 2. Teacher conflict check
        if (teacherId && entry.teacherId && teacherId === entry.teacherId) {
          const subTitle = entry.subjectName || entry.subject || "Class";
          return {
            conflict: true,
            type: "teacher",
            message: `Teacher conflict: ${entry.teacherName || 'This instructor'} is already assigned to teach ${subTitle} (${entry.department || ''} Sem ${entry.semester || ''} Sec ${entry.section || ''}) from ${entry.startTime} to ${entry.endTime}.`,
            conflictingEntry: { id: doc.id, ...entry }
          };
        }
      }

      return { conflict: false };
    } catch (err) {
      console.warn("[TimetableService] Conflict check fallback:", err);
      return { conflict: false };
    }
  },

  // ── Write Operations (Admin only) ────────────────────────────────────────

  /** Add a new weekly class schedule entry with conflict validation. */
  async addEntry(data) {
    // 1. Validate times
    if (this.timeToMinutes(data.endTime) <= this.timeToMinutes(data.startTime)) {
      throw new Error("End time must be after start time.");
    }

    // 2. Conflict validation
    const check = await this.checkConflict(data);
    if (check.conflict) {
      throw new Error(check.message);
    }

    try {
      const payload = {
        department:   data.department   || "",
        semester:     String(data.semester || ""),
        section:      data.section      || "",
        academicYear: data.academicYear || "",
        day:          data.day,
        startTime:    data.startTime,
        endTime:      data.endTime,
        subjectId:    data.subjectId    || "",
        subjectName:  data.subjectName  || data.subject || "",
        subject:      data.subjectName  || data.subject || "",
        teacherId:    data.teacherId    || "",
        teacherName:  data.teacherName  || "",
        room:         data.room         || "",
        type:         data.type         || "Lecture",
        notes:        data.notes        || "",
        createdBy:    data.createdBy    || (window.auth?.currentUser?.uid || "admin"),
        createdAt:    firebase.firestore.FieldValue.serverTimestamp()
      };

      const docRef = await window.db.collection("timetable").add(payload);
      return docRef.id;
    } catch (error) {
      console.error("[TimetableService] addEntry error:", error);
      throw error;
    }
  },

  /** Update an existing weekly class schedule entry with conflict validation. */
  async updateEntry(entryId, data) {
    // 1. Validate times
    if (this.timeToMinutes(data.endTime) <= this.timeToMinutes(data.startTime)) {
      throw new Error("End time must be after start time.");
    }

    // 2. Conflict validation (excluding current entry)
    const check = await this.checkConflict({ ...data, excludeId: entryId });
    if (check.conflict) {
      throw new Error(check.message);
    }

    try {
      const payload = {
        department:   data.department   || "",
        semester:     String(data.semester || ""),
        section:      data.section      || "",
        academicYear: data.academicYear || "",
        day:          data.day,
        startTime:    data.startTime,
        endTime:      data.endTime,
        subjectId:    data.subjectId    || "",
        subjectName:  data.subjectName  || data.subject || "",
        subject:      data.subjectName  || data.subject || "",
        teacherId:    data.teacherId    || "",
        teacherName:  data.teacherName  || "",
        room:         data.room         || "",
        type:         data.type         || "Lecture",
        notes:        data.notes        || "",
        updatedAt:    firebase.firestore.FieldValue.serverTimestamp()
      };

      await window.db.collection("timetable").doc(entryId).update(payload);
      return true;
    } catch (error) {
      console.error("[TimetableService] updateEntry error:", error);
      throw error;
    }
  },

  /** Delete a timetable entry permanently. */
  async deleteEntry(entryId) {
    try {
      await window.db.collection("timetable").doc(entryId).delete();
      return true;
    } catch (error) {
      console.error("[TimetableService] deleteEntry error:", error);
      throw error;
    }
  },

  /**
   * Backward-compatibility alias for older callers.
   * Returns all entries grouped by day with a .slots property on each day.
   */
  async getTimetable() {
    const entries = await this.getAll();
    const grouped = this.groupByDay(entries);
    return this.DAYS.map(day => ({
      day,
      slots: (grouped[day] || []).map(s => ({
        ...s,
        time: `${s.startTime}–${s.endTime}`,
        teacher: s.teacherName || ""
      }))
    }));
  },

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Get today's day name. */
  getTodayName() {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[new Date().getDay()];
  },

  /**
   * Group flat entries array into { [day]: [slot, ...] } map.
   * Sorts slots within each day by startTime.
   */
  groupByDay(entries) {
    const map = {};
    this.DAYS.forEach(d => { map[d] = []; });
    entries.forEach(e => {
      if (map[e.day] !== undefined) {
        map[e.day].push(e);
      }
    });
    // Sort by startTime within each day
    this.DAYS.forEach(d => {
      map[d].sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
    });
    return map;
  },

  /**
   * Find the current and next class based on current time.
   * slots = array of entries with startTime / endTime fields.
   */
  getActiveAndUpcomingClass(slots = []) {
    if (!slots || slots.length === 0) return { current: null, next: null };

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    let current = null;
    let next    = null;

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (!slot.startTime || !slot.endTime) continue;
      const startMinutes = this.timeToMinutes(slot.startTime);
      const endMinutes   = this.timeToMinutes(slot.endTime);

      if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
        current = slot;
        next    = slots[i + 1] || null;
        break;
      } else if (currentMinutes < startMinutes && !next) {
        next = slot;
      }
    }

    return { current, next };
  }
};

window.TimetableService = TimetableService;
