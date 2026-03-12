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

function calculateCircleProgress(value) {
  const radius = 40;
  const circumference = Math.PI * (radius * 2);
  const bounded = Math.min(100, Math.max(0, value));
  return ((100 - bounded) / 100) * circumference;
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
  const publicContributions = Math.max(0, stats.totalContributions - stats.privateContributions);
  const privateShare =
    stats.totalContributions > 0
      ? Math.round((stats.privateContributions / stats.totalContributions) * 100)
      : 0;
  const privateLine =
    stats.privateContributions > 0
      ? `${formatNumber(stats.privateContributions)} private contributions included`
      : "Public contributions only";
  const description = `${formatNumber(stats.totalContributions)} contributions in the last year. ${privateLine}.`;
  const progress = calculateCircleProgress(privateShare || 100);

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
    .header {
      font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif;
      fill: #ffffff;
      animation: fadeInAnimation 0.8s ease-in-out forwards;
    }
    @supports(-moz-appearance: auto) {
      .header { font-size: 15.5px; }
    }
    .stat {
      font: 600 14px 'Segoe UI', Ubuntu, "Helvetica Neue", Sans-Serif;
      fill: #ffffff;
    }
    @supports(-moz-appearance: auto) {
      .stat { font-size: 12px; }
    }
    .stagger {
      opacity: 0;
      animation: fadeInAnimation 0.3s ease-in-out forwards;
    }
    .bold {
      font-weight: 700;
    }
    .not-bold {
      font-weight: 400;
    }
    .icon-caption {
      font: 600 11px 'Segoe UI', Ubuntu, Sans-Serif;
      fill: #ffffff;
      opacity: 0.75;
      letter-spacing: 1.6px;
    }
    .ring-number {
      font: 800 24px 'Segoe UI', Ubuntu, Sans-Serif;
      fill: #ffffff;
      animation: fadeInAnimation 0.3s ease-in-out forwards;
    }
    .ring-label {
      font: 600 10px 'Segoe UI', Ubuntu, Sans-Serif;
      fill: #ffffff;
      opacity: 0.72;
      animation: fadeInAnimation 0.5s ease-in-out forwards;
    }
    .rank-circle-rim {
      stroke: #ffffff;
      fill: none;
      stroke-width: 6;
      opacity: 0.2;
    }
    .rank-circle {
      stroke: #ffffff;
      stroke-dasharray: 250;
      fill: none;
      stroke-width: 6;
      stroke-linecap: round;
      opacity: 0.85;
      transform-origin: -10px 8px;
      transform: rotate(-90deg);
      animation: rankAnimation 1s forwards ease-in-out;
    }
    @keyframes rankAnimation {
      from {
        stroke-dashoffset: 251.32741228718345;
      }
      to {
        stroke-dashoffset: ${progress};
      }
    }
    @keyframes fadeInAnimation {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  </style>
  <defs>
    <linearGradient id="gradient" gradientTransform="rotate(0)" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#12c2e9" />
      <stop offset="50%" stop-color="#c471ed" />
      <stop offset="100%" stop-color="#f64f59" />
    </linearGradient>
  </defs>
  <rect
    data-testid="card-bg"
    x="0.5"
    y="0.5"
    rx="4.5"
    height="99%"
    width="449"
    stroke="#e4e2e2"
    stroke-opacity="1"
    fill="url(#gradient)"
  />
  <g data-testid="card-title" transform="translate(25, 35)">
    <text x="0" y="0" class="header" data-testid="header">${escapeXml(title)}</text>
  </g>
  <g data-testid="main-card-body" transform="translate(0, 55)">
    <g data-testid="rank-circle" transform="translate(365, 43.5)">
      <circle class="rank-circle-rim" cx="-10" cy="8" r="40" />
      <circle class="rank-circle" cx="-10" cy="8" r="40" />
      <text
        class="ring-number"
        x="-10"
        y="8"
        alignment-baseline="central"
        dominant-baseline="central"
        text-anchor="middle"
      >${escapeXml(formatNumber(stats.totalContributions))}</text>
    </g>
    <text class="ring-label" x="355" y="113" text-anchor="middle">LAST YEAR</text>
    <svg x="0" y="0">
      <g transform="translate(0, 0)">
        <g class="stagger" style="animation-delay: 450ms" transform="translate(25, 0)">
          <text class="stat bold" y="12.5">Total Contributions:</text>
          <text class="stat bold" x="230" y="12.5">${escapeXml(formatNumber(stats.totalContributions))}</text>
        </g>
      </g>
      <g transform="translate(0, 25)">
        <g class="stagger" style="animation-delay: 600ms" transform="translate(25, 0)">
          <text class="stat bold" y="12.5">Public Contributions:</text>
          <text class="stat bold" x="230" y="12.5">${escapeXml(formatNumber(publicContributions))}</text>
        </g>
      </g>
      <g transform="translate(0, 50)">
        <g class="stagger" style="animation-delay: 750ms" transform="translate(25, 0)">
          <text class="stat bold" y="12.5">Private Included:</text>
          <text class="stat bold" x="230" y="12.5">${escapeXml(formatNumber(stats.privateContributions))}</text>
        </g>
      </g>
      <g transform="translate(0, 75)">
        <g class="stagger" style="animation-delay: 900ms" transform="translate(25, 0)">
          <text class="stat not-bold" y="12.5">Private Share:</text>
          <text class="stat not-bold" x="230" y="12.5">${escapeXml(String(privateShare))}%</text>
        </g>
      </g>
      <g transform="translate(0, 100)">
        <g class="stagger" style="animation-delay: 1050ms" transform="translate(25, 0)">
          <text class="stat not-bold" y="12.5">${escapeXml(privateLine)}</text>
        </g>
      </g>
    </svg>
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
