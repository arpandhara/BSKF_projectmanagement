import { ClerkExpressRequireAuth } from "@clerk/clerk-sdk-node";

const requireAuth = ClerkExpressRequireAuth({
  onError: (err, req, res) => {
    res.status(401).json({ error: "Unauthenticated: Please log in." });
  },
});

const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    const auth = req.auth;
    
    // 👇 1. Check for Organization Role (e.g., 'org:admin')
    const orgRole = auth.orgRole || auth.sessionClaims?.org_role;

    // 👇 2. Check for Personal Admin Role (e.g., 'admin')
    const personalRole = auth.sessionClaims?.publicMetadata?.role;

    // 👇 3. Determine Effective Role (Prioritize Org, then Personal, then Viewer)
    const effectiveRole = orgRole || personalRole || 'viewer';

    // Debugging Log
    // console.log(`🔐 Auth Check | User: ${auth.userId} | Role Found: ${effectiveRole}`);

    if (!allowedRoles.includes(effectiveRole)) {
      return res.status(403).json({ 
        message: `Access Denied. Required role: ${allowedRoles.join(' or ')}. You are: ${effectiveRole}` 
      });
    }

    next();
  };
};

export {
    requireAuth,
    requireRole
}