# Bob o Construtor - HomeWork Manager

A robust and scalable platform for managing home renovations and construction projects, inspired by the "Bob the Builder" theme.

## Overview

This application is designed to help homeowners and construction professionals manage small home renovations efficiently. While it focuses on home projects, the architecture is fully scalable to handle larger construction works in different locations.

## Target Audience

The application is specifically designed for **Google users**, leveraging Google Authentication for a seamless and secure login experience.

## Key Features & Screens

The app provides several specialized views based on user roles:

- **Dashboard (Painel de Controlo)**: A high-level overview of project statistics (Pending, Accepted, In Progress, Completed, Cancelled). It also features a dynamic "Bob's Tip" section with motivational advice inspired by the show.
- **My Works (Minhas Obras)**: A dedicated view for constructors to manage projects assigned to them.
- **Requested Works (Obras Solicitadas)**: A view for owners to request new projects, track their status, and communicate with constructors.
- **Calendar (Calendário)**: A visual timeline showing the start and end dates of all active projects.
- **Public Works (Obras Públicas)**: A community section where projects can be shared publicly for inspiration or transparency.
- **Admin Panel (Gestão de Utilizadores)**: A powerful interface for administrators to manage user roles (Owner, Constructor, Admin) and oversee all projects in the system.

## Deployment & Requirements

To successfully deploy and run this application, the following requirements must be met:

### 1. Firebase Configuration
The application relies on **Firebase** for data storage and authentication. You must have a Firebase project set up with:
- **Cloud Firestore**: To store project data, user profiles, and comments.
- **Firebase Authentication**: With the **Google Sign-In** provider enabled.

### 2. Environment Setup
A `firebase-applet-config.json` file must be present in the root directory (or provided via environment variables) containing your Firebase project credentials:
- `apiKey`
- `authDomain`
- `projectId`
- `appId`
- `firestoreDatabaseId`

### 3. Security Rules
The application includes a `firestore.rules` file that must be deployed to your Firebase project to ensure data security and proper access control based on user roles.

### 4. Deployment Environment
The app is built using **React, Vite, and Tailwind CSS**. It can be deployed to any modern containerized environment like **Google Cloud Run**, or hosted as a static site if the backend logic is handled via Firebase.

---
*"Can we build it? Yes, we can!"*
