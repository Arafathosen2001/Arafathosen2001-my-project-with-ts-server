import express from "express";
import type { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import cors from "cors";
import {
  MongoClient,
  ServerApiVersion,
  ObjectId,
} from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose-cjs";

dotenv.config();

const app = express();

const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";

app.use(
  cors({
    origin: clientUrl,
    credentials: true,
  })
);
app.use(express.json());

const port = Number(process.env.PORT) || 5000;

const uri = process.env.MONGO_URI;

if (!uri) {
  throw new Error("MONGODB_URI is missing in .env");
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const JWKS = createRemoteJWKSet(
  new URL(`${clientUrl}/api/auth/jwks`)
);

const verifyToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];

  if (!authHeader || !token) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    await jwtVerify(token, JWKS);
    next();
  } catch {
    res.status(401).json({ message: "Unauthorized" });
  }
};

function parseObjectId(id: string): ObjectId | null {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  return new ObjectId(id);
}

function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch((error) => {
      console.error(error);
      res.status(500).json({ message: "Internal server error" });
    });
  };
}

async function run() {
  try {
    // await client.connect();

    const db = client.db("ts-project");
    const collectionProjects = db.collection("projects");

    app.get(
      "/projects",
      asyncHandler(async (req: Request, res: Response) => {
        const ownerId = req.query.ownerId as string | undefined;
        const filter = ownerId ? { ownerId } : {};
        const result = await collectionProjects.find(filter).toArray();
        res.status(200).json(result);
      })
    );

    app.get(
      "/projects/:id",
      asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const objectId = parseObjectId(id as any);

        if (!objectId) {
          res.status(400).json({ message: "Invalid project id" });
          return;
        }

        const result = await collectionProjects.findOne({ _id: objectId });

        if (!result) {
          res.status(404).json({ message: "Project not found" });
          return;
        }

        res.status(200).json(result);
      })
    );

    app.post(
      "/projects",
      asyncHandler(async (req: Request, res: Response) => {
        const projectData = req.body;
        const requiredFields = ["title", "category", "ownerId"] as const;

        for (const field of requiredFields) {
          if (!projectData?.[field]) {
            res.status(400).json({ message: `${field} is required` });
            return;
          }
        }

        const result = await collectionProjects.insertOne({
          ...projectData,
          ownerId: projectData.ownerId,
          createdAt: new Date(),
        });

        res.status(201).json(result);
      })
    );

    app.delete(
      "/projects/:id",
      asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const objectId = parseObjectId(id as any);

        if (!objectId) {
          res.status(400).json({ message: "Invalid project id" });
          return;
        }

        const result = await collectionProjects.deleteOne({ _id: objectId });

        if (result.deletedCount === 0) {
          res.status(404).json({ message: "Project not found" });
          return;
        }

        res.status(200).json({ message: "Project deleted successfully" });
      })
    );

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}

run().catch(console.dir);

app.get("/", (_req: Request, res: Response) => {
  res.status(200).send("Hello World! Server is running");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
