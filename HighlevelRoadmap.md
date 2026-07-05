AI powered Note taking and research app idea

Product Overview

Product Vision: An AI-Powered, Context-Aware Knowledge Hub
Core User Experience & Workflow
Intelligent Capture & Auto-Routing: Users define custom GOALS (intelligent categories based on their personal goals or projects). They can then freely write their thoughts into a frictionless Mind dump space. The underlying AI automatically evaluates the text, creates a timestamp for the entry, and seamlessly routes it to the most relevant GOALS, attaching a confidence score based on contextual fit.
Conversational Knowledge Retrieval: Once notes are captured and organized, users can interact with their entire database via natural language. For instance, a user can prompt the LLM with, "Summarize the notes I wrote about Linux commands and active tickets under my 'Work' Goal." The AI will synthesize the requested information into a coherent response, complete with direct citations to the original note blocks, but it can infer the Goal from context also.
Autonomous Research & Synthesis: As a secondary pillar, Prognoteic leverages integrated LLM and WebSearch tools to act as an automated research assistant. When a user logs a topic in the "To Be Researched" Objective, the AI can independently crawl the web, review the subject, and format its findings. All AI-generated content is clearly tagged and held in a Staging Inbox for mandatory user review, ensuring absolute accuracy before the data is merged into the user's permanent knowledge base.

Core Concept: Objectives & System Topics
The foundational organizational unit of the application is the Objective, which now exists in two forms:
1. Custom Objectives (User-Defined)
Definition: Intelligent categories, themes, or projects created by the user (e.g., "Work," "Gym," "Game Dev").
Contextual Descriptions: Users provide a thorough description for each Objective to guide the AI's sorting algorithms.
2. Permanent System Topics (Built-In)
Definition: Default, non-deletable categories designed to capture functional items across all custom Objectives.
Core Examples:
Todo Tasks: Automatically catches and collates action items and deliverables.
To Be Researched: Automatically catches questions, unknown concepts, or topics flagged for future learning.
Smart Duplication (Cross-Pollination): A single note block can exist in multiple places simultaneously (e.g., an action item in a specific project is mirrored in "Todo Tasks").
User Interface Layout
Left Sidebar: Navigation & Organization
Toggleable Design: A collapsible left-hand panel that maximizes workspace when closed.
Staging Inbox (Temporary Notes): A dedicated holding zone for AI-generated research and synthesized topics awaiting user approval to be added to the note’s persisted data collection.
System Topics: Pinned near the top (e.g., "Todo Tasks", "To Be Researched") for easy access to functional items.
Quick Note Access: Pinned permanently to the top of the list for immediate access to a frictionless, unassigned writing space that will be blocked by time interval to create consistent note blocks.
Objective List: Displays all user-created Custom Objectives in a clean list view.
Main Workspace: Note Creation & Viewing
Chronological Feed: Displays all notes within a selected Objective or Topic.
Rich Text Formatting: Full support for Markdown formatting.
In-Line AI Assistance: Highlighting text brings up a localized AI prompt for contextual actions (e.g., calculating macros from a list of ingredients for foods).
Right Sidebar: AI Conversational Assistant
Toggleable Chat Interface: An expandable window on the right side of the screen for natural language querying across all notes.
Core Features & Mechanics
Note Block Mechanics & Timestamps
Fluid Creation & Idle Auto-Save: Typing initiates a timestamped block. Leaving it idle (default: 5 minutes) finalizes and saves it.
Block Management: Double-click a saved block to re-enter edit mode to extend, revise, or delete.
Experimental Weighting Tokens: Users can utilize special bracket syntax (e.g., <[this is a work note]>) to explicitly signal key phrases to the LLM for highly accurate categorization.
The "Quick Note" Intelligence Engine
Frictionless Entry & Auto-Sorting: A brain-dump space where completed blocks are automatically routed by the AI based on Objective descriptions.
AI Auto-Creation: The AI autonomously generates brand-new Objectives if a note doesn't fit existing categories.
Daily Retention & Manual Override: Auto-sorted blocks remain visible on the Quick Note page for the day with a visual tag. Users can double-click to manually override the AI's choice.
Voice & Dictation Engine
Native Speech-to-Text: A built-in, highly accurate dictation engine (powered by Whisper models) that allows users to seamlessly voice-record their notes directly into the app. The AI cleans up grammatical errors and filler words before saving the text as a note block.
Third-Party Integration: Full compatibility with system-wide dictation overlays like Wispr Flow, ensuring that users can leverage their preferred low-latency voice engines to dictate directly into the Main Workspace or Quick Note areas without breaking focus.
Multimodal Capture & Processing
Smart Imports: Upload images with natural language prompts (e.g., extracting data from a photo of a nutrition label into a Markdown table).
Handwriting & OCR: Snap a picture of physical paper notes for the AI to transcribe and route.
AI Deep Research Mode & Staging Inbox
Autonomous Deep Dives: Users can instruct the AI to research specific chunks of notes or entire categories (e.g., "Research all my IT notes").
Link Crawling: The AI will actively follow URLs pasted within those notes to gather external context.
Topic Synthesis: The AI processes this data and generates comprehensive, structured topics one by one.
The Staging Inbox: AI-generated research is placed in a Temporary Note inbox. The research remains pending here indefinitely until the user reads it through and explicitly "ticks" (approves) it, at which point it is permanently merged into the relevant Objective.
Advanced Discovery & Visualization
Universal Search & Filter
Universal Search Bar: Independent search with Fuzzy Finding and granular manual filtering (date, Objective, exact text).
Experimental Spatial Knowledge Graph
Visual Relationship Mapping: A dedicated visualization page where Objectives and note blocks are represented as nodes in a web.
Proximity by Relevance: The physical distance between a note and an Objective is determined by the LLM's confidence score.
Chronological Connection Strings: The visual lines connecting notes to Objectives change dynamically based on the note's age (e.g., thick/bright lines for today, thin/faded lines for older notes), giving an intuitive visual map of active thoughts over time.
