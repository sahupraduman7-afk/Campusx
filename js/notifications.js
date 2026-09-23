/**
 * CAMPUSX — NOTIFICATION CENTER MODULE
 * Real-time notification store, unread counter, and mark-as-read handlers.
 */

const NotificationService = {
  STORAGE_KEY: "campusx_notifications",

  async getNotifications() {
    try {
      const snapshot = await window.db.collection("notifications").get();
      const list = [];
      snapshot.docs.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });
      return list;
    } catch (error) {
      console.error("[NotificationService] Fetch error:", error);
      return [];
    }
  },

  async markAsRead(notifId) {
    try {
      await window.db.collection("notifications").doc(notifId).update({ read: true });
      this.updateUnreadBadges();
      return true;
    } catch (e) {
      console.error("[NotificationService] Mark as read error:", e);
    }
  },

  async markAllAsRead() {
    try {
      const all = await this.getNotifications();
      for (const n of all) {
        if (!n.read) {
          await window.db.collection("notifications").doc(n.id).update({ read: true });
        }
      }
      this.updateUnreadBadges();
      return true;
    } catch (e) {
      console.error("[NotificationService] Mark all read error:", e);
    }
  },

  async updateUnreadBadges() {
    const notifications = await this.getNotifications();
    const unreadCount = notifications.filter(n => !n.read).length;

    document.querySelectorAll(".icon-badge, .unread-notif-count").forEach(el => {
      el.textContent = unreadCount;
      el.style.display = unreadCount > 0 ? "flex" : "none";
    });
  }
};

window.NotificationService = NotificationService;

document.addEventListener("DOMContentLoaded", () => {
  NotificationService.updateUnreadBadges();
});
