/**
 * CAMPUSX — ATTENDANCE MODULE
 * Per-session, per-student attendance marking (teacher) and personal analytics (student).
 *
 * Firestore document structure:
 *   attendance/{recordId}
 *     studentId    : string  — student UID
 *     studentName  : string
 *     department   : string
 *     semester     : string
 *     section      : string
 *     subjectId    : string
 *     subjectName  : string
 *     date         : string  — "YYYY-MM-DD"
 *     period       : string  — e.g. "09:00-10:00"
 *     status       : "present" | "absent"
 *     markedBy     : string  — teacher UID
 *     markedAt     : Timestamp (server timestamp)
 */

const AttendanceService = {

  // ─── TEACHER ────────────────────────────────────────────────────────────────

  /**
   * Load students for a given department + semester + section from users collection.
   * Returns array of { uid, displayName, rollNumber }.
   */
  async getStudentsForClass({ department, semester, section }) {
    try {
      let query = window.db.collection('users')
        .where('role', '==', 'student')
        .where('status', '==', 'active');

      if (department) query = query.where('department', '==', department);
      if (semester)   query = query.where('semester', '==', semester);
      if (section)    query = query.where('section', '==', section);

      const snapshot = await query.get();
      const students = [];
      snapshot.docs.forEach(doc => {
        const d = doc.data();
        students.push({
          uid: doc.id,
          displayName: d.displayName || d.name || 'Unknown',
          rollNumber: d.rollNumber || d.enrollmentNumber || ''
        });
      });
      // Sort by name
      students.sort((a, b) => a.displayName.localeCompare(b.displayName));
      return students;
    } catch (error) {
      console.error('[AttendanceService] getStudentsForClass error:', error);
      throw error;
    }
  },

  /**
   * Check if attendance already exists for a given session.
   * Returns array of existing records (empty if not yet saved).
   */
  async getSessionRecords({ department, semester, section, subjectId, date, period }) {
    try {
      const snapshot = await window.db.collection('attendance')
        .where('department', '==', department)
        .where('semester', '==', semester)
        .where('section', '==', section)
        .where('subjectId', '==', subjectId)
        .where('date', '==', date)
        .where('period', '==', period)
        .get();

      const records = [];
      snapshot.docs.forEach(doc => records.push({ id: doc.id, ...doc.data() }));
      return records;
    } catch (error) {
      console.error('[AttendanceService] getSessionRecords error:', error);
      throw error;
    }
  },

  /**
   * Save (or overwrite) attendance for an entire session.
   * attendanceMap = { [studentId]: "present" | "absent" }
   * studentList   = [{ uid, displayName }]
   */
  async saveSessionAttendance({
    department, semester, section,
    subjectId, subjectName,
    date, period,
    markedBy,
    attendanceMap,
    studentList
  }) {
    try {
      const batch = window.db.batch();

      // Delete any existing records for this session first (edit flow)
      const existing = await this.getSessionRecords({ department, semester, section, subjectId, date, period });
      existing.forEach(rec => {
        batch.delete(window.db.collection('attendance').doc(rec.id));
      });

      // Write fresh records
      studentList.forEach(student => {
        const status = attendanceMap[student.uid] || 'absent';
        const docRef = window.db.collection('attendance').doc();
        batch.set(docRef, {
          studentId: student.uid,
          studentName: student.displayName,
          department,
          semester,
          section,
          subjectId,
          subjectName,
          date,
          period,
          status,
          markedBy,
          markedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });

      await batch.commit();
      return true;
    } catch (error) {
      console.error('[AttendanceService] saveSessionAttendance error:', error);
      throw error;
    }
  },

  // ─── STUDENT ────────────────────────────────────────────────────────────────

  /**
   * Fetch all attendance records for the currently logged-in student (own UID only).
   * Returns array of records.
   */
  async getMyAttendance(studentId) {
    try {
      const snapshot = await window.db.collection('attendance')
        .where('studentId', '==', studentId)
        .get();

      const records = [];
      snapshot.docs.forEach(doc => records.push({ id: doc.id, ...doc.data() }));
      return records;
    } catch (error) {
      console.error('[AttendanceService] getMyAttendance error:', error);
      throw error;
    }
  },

  /**
   * Aggregate individual records into per-subject summary.
   * Returns array of { subjectId, subjectName, attended, total, percentage }
   */
  aggregateBySubject(records = []) {
    const map = {};
    records.forEach(r => {
      if (!map[r.subjectId]) {
        map[r.subjectId] = {
          subjectId: r.subjectId,
          subjectName: r.subjectName,
          attended: 0,
          total: 0
        };
      }
      map[r.subjectId].total += 1;
      if (r.status === 'present') map[r.subjectId].attended += 1;
    });

    return Object.values(map).map(s => ({
      ...s,
      percentage: s.total > 0 ? Number(((s.attended / s.total) * 100).toFixed(1)) : 0
    }));
  },

  // ─── SHARED CALCULATORS ─────────────────────────────────────────────────────

  calculateOverall(subjectSummaries = []) {
    if (!subjectSummaries.length) return { attended: 0, total: 0, percentage: 0 };
    const totalAttended = subjectSummaries.reduce((s, r) => s + r.attended, 0);
    const totalClasses  = subjectSummaries.reduce((s, r) => s + r.total, 0);
    const percentage    = totalClasses > 0 ? Number(((totalAttended / totalClasses) * 100).toFixed(1)) : 0;
    return { attended: totalAttended, total: totalClasses, percentage };
  },

  calculateProjection(attended, total, targetPercent = 75) {
    attended = Number(attended);
    total    = Number(total);

    if (total === 0) {
      return { status: 'eligible', message: 'No classes conducted yet.', count: 0 };
    }

    const currentPercentage = (attended / total) * 100;
    const targetRatio = targetPercent / 100;

    if (currentPercentage < targetPercent) {
      const needed = Math.ceil((targetRatio * total - attended) / (1 - targetRatio));
      return {
        status: 'shortage',
        currentPercentage: Number(currentPercentage.toFixed(1)),
        isEligible: false,
        classesNeeded: needed,
        message: `Attendance is below ${targetPercent}%. You need to attend the next ${needed} consecutive class(es) to reach eligibility.`
      };
    } else {
      const safeBunks = Math.floor((attended - targetRatio * total) / targetRatio);
      return {
        status: 'safe',
        currentPercentage: Number(currentPercentage.toFixed(1)),
        isEligible: true,
        safeBunks,
        message: `Attendance is above ${targetPercent}%. You can safely miss up to ${safeBunks} upcoming class(es) while staying eligible.`
      };
    }
  }
};

window.AttendanceService = AttendanceService;
