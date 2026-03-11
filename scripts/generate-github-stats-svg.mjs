#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_USERNAME = process.env.GITHUB_REPOSITORY_OWNER || "jingfelix";
const OUTPUT_PATH = process.env.OUTPUT_PATH || "assets/github-stats.svg";
const PROFILE_USERNAME = process.env.PROFILE_USERNAME || DEFAULT_USERNAME;
const API_TOKEN = process.env.GH_STATS_TOKEN || process.env.GITHUB_TOKEN;

if (!API_TOKEN) {
  console.error("Missing GitHub token. Set GH_STATS_TOKEN or GITHUB_TOKEN.");
  process.exit(1);
}

const statsQuery = `
  query contributionSummary($login: String!) {
    user(login: $login) {
      name
      login
      contributionsCollection {
        restrictedContributionsCount
        contributionCalendar {
          totalContributions
        }
      }
    }
  }
`;

async function graphql(query, variables) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "jingfelix-profile-stats-generator",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL request failed with ${response.status}.`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  return payload.data;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

async function fetchStats(username) {
  const data = await graphql(statsQuery, { login: username });
  const user = data.user;

  if (!user) {
    throw new Error(`GitHub user "${username}" was not found.`);
  }

  return {
    name: user.name || user.login,
    totalContributions: user.contributionsCollection.contributionCalendar.totalContributions,
    privateContributions: user.contributionsCollection.restrictedContributionsCount,
  };
}

function renderSvg(stats) {
  const title = `${stats.name}'s GitHub Contributions`;
  const subtitle = `${formatNumber(stats.totalContributions)} contributions in the last year`;
  const privateLine =
    stats.privateContributions > 0
      ? `${formatNumber(stats.privateContributions)} private contributions included`
      : "Public contributions only";
  const description = `${subtitle}. ${privateLine}.`;

  return `
<svg
  width="450"
  height="195"
  viewBox="0 0 450 195"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  role="img"
  aria-labelledby="titleId descId"
>
  <title id="titleId">${escapeXml(title)}</title>
  <desc id="descId">${escapeXml(description)}</desc>
  <style>
    .title {
      font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif;
      fill: #ffffff;
      animation: fadeIn 0.8s ease-in-out forwards;
    }
    .number {
      font: 700 60px 'Segoe UI', Ubuntu, Sans-Serif;
      fill: #ffffff;
      animation: riseIn 0.7s ease-out forwards;
      letter-spacing: -1px;
    }
    .subtitle {
      font: 500 16px 'Segoe UI', Ubuntu, Sans-Serif;
      fill: rgba(255, 255, 255, 0.94);
      animation: fadeIn 1s ease-in-out forwards;
    }
    .pill {
      font: 600 12px 'Segoe UI', Ubuntu, Sans-Serif;
      fill: #ffffff;
      animation: fadeIn 1.2s ease-in-out forwards;
    }
    .pill-bg {
      fill: rgba(255, 255, 255, 0.12);
      stroke: rgba(255, 255, 255, 0.2);
    }
    .shape-a {
      fill: rgba(255, 255, 255, 0.09);
    }
    .shape-b {
      fill: rgba(255, 255, 255, 0.06);
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes riseIn {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  </style>
  <defs>
    <linearGradient id="gradient" gradientTransform="rotate(8)" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#12c2e9" />
      <stop offset="52%" stop-color="#c471ed" />
      <stop offset="100%" stop-color="#f64f59" />
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="449" height="194" rx="18" fill="url(#gradient)" />
  <circle class="shape-a" cx="386" cy="42" r="54" />
  <circle class="shape-b" cx="415" cy="132" r="72" />
  <circle class="shape-b" cx="56" cy="171" r="42" />
  <g transform="translate(28, 34)">
    <text class="title">${escapeXml(title)}</text>
    <text class="number" x="0" y="82">${escapeXml(formatNumber(stats.totalContributions))}</text>
    <text class="subtitle" x="0" y="114">contributions in the last year</text>
    <g transform="translate(0, 132)">
      <rect class="pill-bg" width="228" height="28" rx="14" />
      <text class="pill" x="14" y="18">${escapeXml(privateLine)}</text>
    </g>
  </g>
</svg>`.trimStart();
}

async function main() {
  const stats = await fetchStats(PROFILE_USERNAME);
  const outputDirectory = path.dirname(OUTPUT_PATH);
  const svg = renderSvg(stats);

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(OUTPUT_PATH, svg, "utf8");

  console.log(
    `Generated ${OUTPUT_PATH} for ${PROFILE_USERNAME} with ${stats.totalContributions} contributions.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
