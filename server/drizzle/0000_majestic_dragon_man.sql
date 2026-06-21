CREATE TABLE `chapter_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`chapter_id` text NOT NULL,
	`content` text NOT NULL,
	`pass_type` text NOT NULL,
	`word_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chapters` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`arc_id` text,
	`style_profile_id` text,
	`number` integer NOT NULL,
	`title` text,
	`outline` text,
	`word_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'outline' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `character_states` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`chapter_id` text NOT NULL,
	`location` text,
	`condition` text,
	`emotional_state` text,
	`active_goals` text,
	`current_knowledge` text,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`arc_id` text,
	`name` text NOT NULL,
	`aliases` text,
	`appearance` text,
	`background` text,
	`personality` text,
	`motivation` text,
	`fears` text,
	`secrets` text,
	`abilities` text,
	`flaws` text,
	`speech_patterns` text,
	`voice_profile_stub` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `foreshadowing_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`setup` text NOT NULL,
	`planned_payoff` text,
	`opened_in_chapter_id` text,
	`resolved_in_chapter_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `generation_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`chapter_id` text NOT NULL,
	`pass_type` text NOT NULL,
	`model_used` text NOT NULL,
	`tokens_in` integer NOT NULL,
	`tokens_out` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`title` text NOT NULL,
	`description` text,
	`category` text,
	`linked_entities` text,
	`is_used` integer DEFAULT 0 NOT NULL,
	`reuse_count` integer DEFAULT 0 NOT NULL,
	`deviation_factor` integer DEFAULT 0 NOT NULL,
	`inspiration_for` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `kb_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`layer` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`content` text NOT NULL,
	`compressed_content` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `location_states` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text NOT NULL,
	`chapter_id` text NOT NULL,
	`current_occupants` text,
	`condition` text,
	`active_events` text,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`region` text,
	`description` text,
	`atmosphere` text,
	`lore` text,
	`current_state` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `lore_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`tags` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `major_arcs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`chapter_start` integer DEFAULT 1 NOT NULL,
	`chapter_end` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`central_conflict` text,
	`arc_goal` text,
	`opening_state` text,
	`closing_state` text,
	`tone_keywords` text DEFAULT '[]' NOT NULL,
	`characters` text DEFAULT '[]' NOT NULL,
	`themes` text DEFAULT '[]' NOT NULL,
	`lore_introduced` text DEFAULT '[]' NOT NULL,
	`lore_developed` text DEFAULT '[]' NOT NULL,
	`foreshadowing_seeds` text DEFAULT '[]' NOT NULL,
	`generated_by_llm` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `plot_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'planted' NOT NULL,
	`urgency` integer DEFAULT 2 NOT NULL,
	`opened_in_chapter_id` text,
	`last_seen_chapter_id` text,
	`resolved_in_chapter_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`logline` text,
	`genre` text,
	`tone` text,
	`content_rating` text DEFAULT 'general' NOT NULL,
	`pov` text DEFAULT 'third-limited' NOT NULL,
	`target_word_count` integer DEFAULT 100000 NOT NULL,
	`current_word_count` integer DEFAULT 0 NOT NULL,
	`recent_chapters_count` integer DEFAULT 3 NOT NULL,
	`min_recent_chapters` integer DEFAULT 1 NOT NULL,
	`max_recent_chapters` integer DEFAULT 5 NOT NULL,
	`min_word_count_per_chapter` integer DEFAULT 2000 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`from_char_id` text NOT NULL,
	`to_char_id` text NOT NULL,
	`type` text NOT NULL,
	`history` text,
	`current_dynamic` text,
	`intensity` integer DEFAULT 3 NOT NULL,
	FOREIGN KEY (`from_char_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_char_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `state_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`chapter_id` text NOT NULL,
	`chapter_number` integer NOT NULL,
	`character_states` text NOT NULL,
	`location_states` text NOT NULL,
	`open_threads` text NOT NULL,
	`new_canon_facts` text NOT NULL,
	`world_changes` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `state_snapshots_chapter_id_unique` ON `state_snapshots` (`chapter_id`);--> statement-breakpoint
CREATE TABLE `story_arcs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `style_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`uploaded_samples` text,
	`extracted_profile` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sub_arcs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`parent_arc_id` text NOT NULL,
	`title` text NOT NULL,
	`chapter_start` integer DEFAULT 1 NOT NULL,
	`chapter_end` integer DEFAULT 1 NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`plot_progression` text DEFAULT 'setup' NOT NULL,
	`emotional_arc` text,
	`pacing_notes` text,
	`characters_involved` text DEFAULT '[]' NOT NULL,
	`character_developments` text DEFAULT '[]' NOT NULL,
	`plot_points` text DEFAULT '[]' NOT NULL,
	`unresolved_threads` text DEFAULT '[]' NOT NULL,
	`lore_introduced` text DEFAULT '[]' NOT NULL,
	`lore_developed` text DEFAULT '[]' NOT NULL,
	`lore_revealed` text DEFAULT '[]' NOT NULL,
	`foreshadowing_planted` text DEFAULT '[]' NOT NULL,
	`foreshadowing_payoffs` text DEFAULT '[]' NOT NULL,
	`closure_summary` text,
	`generated_by_llm` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_arc_id`) REFERENCES `major_arcs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `world_foundations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`cosmology` text,
	`history` text,
	`geography` text,
	`political_landscape` text,
	`economy` text,
	`culture` text,
	`magic_or_tech_rules` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
