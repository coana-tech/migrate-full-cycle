import axios from "axios";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";

const execAsync = promisify(exec);

// Function to execute a command asynchronously
async function runScript(command: string): Promise<void> {
  try {
    console.log(`Running: ${command}`);
    const { stdout, stderr } = await execAsync(command);
    console.log(stdout);
    if (stderr) {
      console.error(stderr);
    }
  } catch (error: any) {
    console.error(`Error running script: ${error}`);
    throw error; // Re-throw to stop the process
  }
}

async function fetchUsers(clerkSecretKey: string): Promise<any[]> {
  try {
    const response = await axios.get(
      "https://api.clerk.com/v1/users?limit=500",
      {
        headers: {
          Authorization: `Bearer ${clerkSecretKey}`,
        },
      }
    );
    return response.data;
  } catch (error: any) {
    console.error("Error fetching users:", error);
    throw error;
  }
}

async function fetchOrganizations(clerkSecretKey: string): Promise<any[]> {
  try {
    const response = await axios.get(
      "https://api.clerk.com/v1/organizations?limit=500",
      {
        headers: {
          Authorization: `Bearer ${clerkSecretKey}`,
        },
      }
    );
    return response.data.data;
  } catch (error: any) {
    console.error("Error fetching organizations:", error);
    throw error;
  }
}

async function fetchOrganizationMemberships(
  organizationId: string,
  clerkSecretKey: string
): Promise<any[]> {
  try {
    const response = await axios.get(
      `https://api.clerk.com/v1/organizations/${organizationId}/memberships?limit=500`,
      {
        headers: {
          Authorization: `Bearer ${clerkSecretKey}`,
        },
      }
    );
    return response.data;
  } catch (error: any) {
    console.error(
      `Error fetching memberships for organization ${organizationId}:`,
      error
    );
    throw error;
  }
}

async function main() {
  const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
  const WORKOS_SECRET_KEY = process.env.WORKOS_SECRET_KEY;
  const OUTPUT_PATH_USERS = "./users_output.json";
  const OUTPUT_PATH_ORGANIZATIONS = "./orgs_output.json";

  if (!CLERK_SECRET_KEY || !WORKOS_SECRET_KEY) {
    console.error(
      "Error: Missing required environment variables (CLERK_SECRET_KEY, WORKOS_SECRET_KEY)."
    );
    process.exit(1);
  }

  if (
    (CLERK_SECRET_KEY.includes("test_") &&
      !WORKOS_SECRET_KEY.includes("test_")) ||
    (!CLERK_SECRET_KEY.includes("test_") && WORKOS_SECRET_KEY.includes("test_"))
  ) {
    console.error(
      "Error: Both secret keys should be test keys, should not run test data against production data."
    );
    process.exit(1);
  }

  try {
    // Fetch data
    const users = await fetchUsers(CLERK_SECRET_KEY);
    const organizations = await fetchOrganizations(CLERK_SECRET_KEY);
    console.log(`Fetched ${users.length} users.`);

    console.log(`Fetched ${organizations.length} organizations.`);
    // Run export scripts
    fs.writeFile(
      "src/files/users.json",
      JSON.stringify(users, null, 2),
      (err: any) => {
        // In case of a error throw err.
        if (err) console.error(err);
      }
    );
    fs.writeFile(
      "src/files/organizations.json",
      JSON.stringify(organizations, null, 2),
      (err: any) => {
        // In case of a error throw err.
        if (err) console.error(err);
      }
    );
    await runScript(
      `npx migrate-clerk-users --output=${OUTPUT_PATH_USERS} --WORKOS_SECRET_KEY=${WORKOS_SECRET_KEY}`
    );
    await runScript(
      `npx migrate-clerk-orgs --output=${OUTPUT_PATH_ORGANIZATIONS} --WORKOS_SECRET_KEY=${WORKOS_SECRET_KEY}`
    );

    // Process organization memberships
    for (const organization of organizations) {
      const memberships = await fetchOrganizationMemberships(
        organization.id,
        CLERK_SECRET_KEY
      );
      fs.writeFile(
        `src/files/memberships/${organization.id}.json`,
        JSON.stringify(memberships, null, 2),
        (err: any) => {
          // In case of a error throw err.
          if (err) console.error(err);
        }
      );
      await runScript(
        `npx migrate-clerk-org-memberships --clerkOrgId=${organization.id} --WORKOS_SECRET_KEY=${WORKOS_SECRET_KEY}`
      );
    }

    console.log("Migration cycle completed successfully.");
  } catch (error) {
    console.error("Migration cycle failed:", error);
    process.exit(1);
  }
}

export default function start() {
  fs.mkdir("src/files/memberships", { recursive: true }, (err: any) => {
    if (err) console.error(err);
  });
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
