// server/controllers/aiController.js
import OpenAI from "openai";
import sql from "../configs/db.js";
import { clerkClient } from "@clerk/express";
import { v2 as cloudinary } from "cloudinary";
import axios from "axios";
import fs from "fs";

import pdf from "pdf-parse/lib/pdf-parse.js";

const AI = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

export const generateArticle = async (req, res) => {
  try {
    const { userId } = await req.auth(); // ← await here
    const { prompt, length } = req.body;
    const plan = req.plan; // set by your auth middleware
    const free_usage = req.free_usage ?? 0;

    const MAX_FREE = 10;
    if (plan !== "premium" && free_usage >= MAX_FREE) {
      return res.status(402).json({
        success: false,
        message: "Free quota exhausted. Please upgrade.",
      });
    }

    // 1) Call the AI
    const response = await AI.chat.completions.create({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: length,
    });

    const content = response.choices[0].message.content;

    // 2) Persist the creation
    await sql`
      INSERT INTO creations (user_id, prompt, content, type)
      VALUES (${userId}, ${prompt}, ${content}, 'article')
    `;

    // 3) Increment free_usage if needed
    if (plan !== "premium") {
      await clerkClient.users.updateUserMetadata(userId, {
        privateMetadata: { free_usage: free_usage + 1 },
      });
    }

    return res.json({ success: true, content });
  } catch (error) {
    console.error("generateArticle error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const generateBlogTitle = async (req, res) => {
  try {
    const { userId } = await req.auth(); // ← await here
    const { prompt } = req.body;
    const plan = req.plan; // set by your auth middleware
    const free_usage = req.free_usage ?? 0;

    const MAX_FREE = 10;
    if (plan !== "premium" && free_usage >= MAX_FREE) {
      return res.status(402).json({
        success: false,
        message: "Free quota exhausted. Please upgrade.",
      });
    }

    // 1) Call the AI
    const response = await AI.chat.completions.create({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 100,
    });

    const content = response.choices[0].message.content;

    // 2) Persist the creation
    await sql`
      INSERT INTO creations (user_id, prompt, content, type)
      VALUES (${userId}, ${prompt}, ${content}, 'blog-title')
    `;

    // 3) Increment free_usage if needed
    if (plan !== "premium") {
      await clerkClient.users.updateUserMetadata(userId, {
        privateMetadata: { free_usage: free_usage + 1 },
      });
    }

    return res.json({ success: true, content });
  } catch (error) {
    console.error("generateArticle error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const generateImage = async (req, res) => {
  try {
    const { userId } = await req.auth(); // ← await here
    const { prompt, publish } = req.body;
    const plan = req.plan; // set by your auth middleware

    if (plan != "premium") {
      return res.status(402).json({
        success: false,
        message: "This feature is only availaible for premium users.",
      });
    }

    // 1) Call the AI
    const formData = new FormData();
    formData.append("prompt", prompt);
    const { data } = await axios.post(
      "https://clipdrop-api.co/text-to-image/v1",
      formData,
      {
        headers: {
          "x-api-key": process.env.CLIP_DROP_API_KEY,
        },
        responseType: "arraybuffer",
      }
    );

    const base64Image = `data:image/png;base64,${Buffer.from(
      data,
      "binary"
    ).toString("base64")}`;

    const { secure_url } = await cloudinary.uploader.upload(base64Image);

    // 2) Persist the creation
    await sql`
      INSERT INTO creations (user_id, prompt, content, type,publish)
      VALUES (${userId}, ${prompt}, ${secure_url}, 'image',${publish ?? false})
    `;

    return res.json({ success: true, content: secure_url });
  } catch (error) {
    console.error("generateArticle error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const removeImageBackground = async (req, res) => {
  try {
    const { userId } = await req.auth(); // ← await here
    const image = req.file; //mg and file req.files men hoti hain//this img will be added using multer
    const plan = req.plan; // set by your auth middleware

    if (plan != "premium") {
      return res.status(402).json({
        success: false,
        message: "This feature is only availaible for premium users.",
      });
    }

    // 1) Call the AI

    const { secure_url } = await cloudinary.uploader.upload(image.path, {
      transformation: [
        {
          effect: "background_removal",
          background_removal: "remove the background",
        },
      ],
    });

    // 2) Persist the creation
    await sql`
      INSERT INTO creations (user_id, prompt, content, type)
      VALUES (${userId},'Remove Background from image', ${secure_url}, 'image')
    `;

    return res.json({ success: true, content: secure_url });
  } catch (error) {
    console.error("generateArticle error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const removeImageObject = async (req, res) => {
  try {
    const { userId } = await req.auth(); // ← await here
    const image = req.file; //mg and file req.files men hoti hain//this img will be added using multer
    const { object } = req.body;
    const plan = req.plan;

    if (plan != "premium") {
      return res.status(402).json({
        success: false,
        message: "This feature is only availaible for premium users.",
      });
    }

    // 1) Call the AI

    const { public_id } = await cloudinary.uploader.upload(image.path);
    const imageUrl = cloudinary.url(public_id, {
      transformation: [
        {
          effect: `gen_remove:${object}`,
        },
      ],
      resource_type: "image",
    });

    // 2) Persist the creation
    await sql`
      INSERT INTO creations (user_id, prompt, content, type)
      VALUES (${userId},${`Remove ${object} from image`}, ${imageUrl}, 'image')
    `;

    return res.json({ success: true, content: imageUrl });
  } catch (error) {
    console.error("generateArticle error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const resumeReview = async (req, res) => {
  try {
    const { userId } = await req.auth(); // ← await here
    const resume = req.file;
    const plan = req.plan;

    if (plan != "premium") {
      return res.status(402).json({
        success: false,
        message: "This feature is only availaible for premium users.",
      });
    }

    // 1) Call the AI

    if (resume.size > 5 * 1024 * 1024) {
      return res.json({
        success: false,
        message: "Resume file size exceeds allowed size(5MB).",
      });
    }

    //now we have to parse the resume and extract the text
    const dataBuffer = fs.readFileSync(resume.path);
    const pdfData = await pdf(dataBuffer);

    const prompt = `Review the following resume and provide constructive feedback on its strengths, weaknesses, and areas for improvement.Resume Content:\n\n${pdfData.text}`;

    const response = await AI.chat.completions.create({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const content = response.choices[0].message.content;

    // 2) Persist the creation
    await sql`
      INSERT INTO creations (user_id, prompt, content, type)
      VALUES (${userId},${`Review the uploaded resume.`}, ${content}, 'resume-review')
    `;

    return res.json({ success: true, content });
  } catch (error) {
    console.error("generateArticle error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
