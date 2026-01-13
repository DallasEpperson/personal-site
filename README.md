# Ground Tracks & Personal Portfolio

A high-performance personal portfolio site and geospatial data visualizer built with React, Vite, and Material UI. This project features a custom-built GIS pipeline for processing, simplifying, and visualizing personal hiking and biking tracks while maintaining a focus on privacy and data efficiency.

## 🛠 Features

### 📍 Ground Tracks GIS Engine
* **Multi-Format Import:** Supports GPX (Strava/Garmin) and GeoJSON imports with automatic timezone detection using `tz-lookup`.
* **Privacy Trimming:** Precise start/end point clipping to protect sensitive locations (e.g., home addresses) with 0.1% precision.
* **Dynamic Simplification:** Implements the Douglas-Peucker algorithm via `simplify-js` to reduce track size by up to 90% while preserving visual fidelity.
* **Lazy Loading:** Initial global view renders low-resolution "previews" from a central manifest; high-resolution coordinate data is fetched on-demand via hover or tap.
* **Collision Resolution:** A custom spatial disambiguation menu for clicking overlapping tracks at busy trailheads, featuring zoom-aware click tolerance and visual highlighting.
* **UTC-First Data Strategy:** All track metadata is persisted in UTC (ISO 8601) to ensure chronological integrity, with localized rendering based on the hike's specific timezone.

### ☁️ Cloud Architecture & DevOps
* **Data Lake Model:** Decoupled application logic from track data, allowing for independent updates to the hike database without redeploying the site infrastructure.
* **S3 Static Hosting:** Optimized for AWS S3 with specific cache-control strategies for long-term asset storage and short-term manifest updates.
* **Validation Scripting:** Shell-based deployment pipeline that validates AWS profiles and local build integrity before syncing to the `dallasepperson-web` bucket.

## 🏗 Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React, Vite |
| **UI Library** | Material UI (MUI) |
| **Mapping** | Leaflet, React-Leaflet |
| **GIS Logic** | gpxparser, simplify-js, tz-lookup |
| **Hosting** | AWS S3 (Static Website Hosting) |
| **Deployment** | Bash / AWS CLI |

## 🚀 Getting Started

### Prerequisites
* Node.js
* AWS CLI configured with a valid profile

### Installation
```bash
npm install
```

### Local Development
```bash
npm run dev
```

### Importing a New Track
1. Navigate to `/import`.
2. Upload a GPX or JSON file.
3. Adjust **Privacy Trim** sliders to clip the start/end of the route.
4. Adjust **Simplification** slider for optimal mileage/point count balance.
5. Click **Export & Copy Manifest** and copy the minified manifest entry to the clipboard.
6. Update the `tracks/index.json` manifest file.

## 🚢 Deployment

The project includes a robust deployment script (`deploy.sh`) that validates the AWS configuration before building.

```bash
# View deployment help
./deploy.sh --help

# Deploy using a specific AWS profile
./deploy.sh <your-aws-profile>
```

## 📂 Project Structure

```
├── public/
│   └── data/tracks/
│       ├── index.json        # Central hike manifest
│       └── {track file}.json # Individual high-res tracks
├── src/
│   ├── components/
│   │   ├── GroundTracks.jsx # Main map engine
│   │   └── ImportTool.jsx   # GIS pre-processor
│   └── ...
├── deploy.sh                # AWS deployment pipeline
└── package.json
```