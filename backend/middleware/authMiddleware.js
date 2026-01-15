import { ClerkExpressRequireAuth } from "@clerk/clerk-sdk-node";

const requireAuth = ClerkExpressRequireAuth({
  onError: (err, req, res) => {
    res.status(401).json({ error: "Unauthenticated: Please log in." });
  },
});

const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    const auth = req.auth;

    // Extract Organization Role from Clerk
    // Clerk stores it in sessionClaims.o.rol as "admin" or "member"
    const orgRole = auth?.sessionClaims?.o?.rol;

    // Check if user's orgRole is in the allowed list
    if (!orgRole || !allowedRoles.includes(orgRole)) {
      return res.status(403).json({
        message: "Insufficient permissions. Admin access required."
      });
    }

    next();
  };
};

export {
  requireAuth,
  requireRole
}