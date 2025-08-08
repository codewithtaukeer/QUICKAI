import { clerkClient } from "@clerk/express";
//Middleware to check user id and has premium plan

export const auth = async (req, res, next) => {
  try {
    const { userId, has } = await req.auth();
    /*const { hasPremiumPlan } = await has({ plan: "premium" });*/
    const hasPremiumPlan = await has({ plan: "premium" });
    console.log("🟢 Premium Plan Status:", hasPremiumPlan);

    const user = await clerkClient.users.getUser(userId);

    if (!hasPremiumPlan && user.privateMetadata.free_usage) {
      await clerkClient.users.updateUserMetadata(userId, {
        privateMetadata: {
          free_usage: 0,
        },
      });
      req.free_usage = 0;
    }
    req.plan = hasPremiumPlan ? "premium" : "free";
    next();
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};
