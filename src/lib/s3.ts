import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";

const s3 = new S3Client({
  region: process.env.S3_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const uploadToS3 = async (
  file: Express.Multer.File,
  folder: string,
  listingId: string
) => {
  const bucket = process.env.S3_BUCKET_NAME!;
  const key = `${folder}/${listingId}/${uuidv4()}-${file.originalname}`;
  const cloudfront = process.env.CLOUDFRONT_URL!;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      CacheControl: "max-age=31536000",
    })
  );

  return `https://${cloudfront}/${key}`;
};

const deleteFolderFromS3 = async (folderPrefix: string): Promise<void> => {
  const bucket = process.env.S3_BUCKET_NAME!;

  const listCommand = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: folderPrefix,
  });

  const listedObjects = await s3.send(listCommand);

  if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
    console.log(`No objects found under ${folderPrefix}`);
    return;
  }

  const deleteCommand = new DeleteObjectsCommand({
    Bucket: bucket,
    Delete: {
      Objects: listedObjects.Contents.map((item) => ({ Key: item.Key! })),
    },
  });

  await s3.send(deleteCommand);
  console.log(`Deleted all objects under ${folderPrefix}`);
};

export { uploadToS3, deleteFolderFromS3 };
