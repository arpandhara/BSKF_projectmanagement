
/**
 * Generates the HTML email content for task assignment
 * @param {string} safeName - The sanitized name of the user
 * @param {string} safeTitle - The sanitized title of the task
 * @param {string} safePriority - The sanitized priority of the task
 * @returns {string} HTML string for the email
 */
export const getTaskAssignmentEmail = (safeName, safeTitle, safePriority) => {
    return `
    <div style="font-family: Arial, sans-serif; color: #333;">
      <h2>New Task Assignment</h2>
      <p>Hi <strong>${safeName}</strong>,</p>
      <p>You have been assigned to a new task:</p>
      <blockquote style="border-left: 4px solid #2563eb; padding-left: 10px; margin: 20px 0;">
        <p><strong>Title:</strong> ${safeTitle}</p>
        <p><strong>Priority:</strong> ${safePriority}</p>
      </blockquote>
      <p>Best regards,<br/>The Team</p>
    </div>
  `;
};
