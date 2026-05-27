CREATE TABLE "dropdown_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" varchar(50) NOT NULL,
	"name" varchar(150) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_dropdown_options_category_name" ON "dropdown_options" USING btree ("category","name");--> statement-breakpoint
CREATE INDEX "idx_dropdown_options_category" ON "dropdown_options" USING btree ("category");--> statement-breakpoint
-- Carry over anything already added to the standalone approved_by_options table.
INSERT INTO "dropdown_options" ("category","name","is_active","sort_order","created_at","updated_at")
SELECT 'approved_by', "name", "is_active", "sort_order", "created_at", "updated_at"
FROM "approved_by_options"
ON CONFLICT ("category","name") DO NOTHING;--> statement-breakpoint
-- Seed initial options extracted from the master worksheet's dropdowns.
INSERT INTO "dropdown_options" ("category","name","sort_order") VALUES
('assigned_to','Aaron',1),('assigned_to','Alex',2),('assigned_to','Amanda',3),('assigned_to','Annie',4),('assigned_to','April',5),('assigned_to','Arvin',6),('assigned_to','Aura',7),('assigned_to','Aurora',8),('assigned_to','Benedict',9),('assigned_to','Bree',10),('assigned_to','Charlie',11),('assigned_to','Clariz',12),('assigned_to','Cora',13),('assigned_to','DeAnne',14),('assigned_to','Ferdie',15),('assigned_to','Georgia',16),('assigned_to','Hunter',17),('assigned_to','Ivan',18),('assigned_to','Jace',19),('assigned_to','Jane',20),('assigned_to','Jean',21),('assigned_to','Josh',22),('assigned_to','Krissa',23),('assigned_to','Lila',24),('assigned_to','Lori',25),('assigned_to','Lovely',26),('assigned_to','Malcolm',27),('assigned_to','Marcus',28),('assigned_to','Miles',29),('assigned_to','Molly',30),('assigned_to','Nelia',31),('assigned_to','Nerry',32),('assigned_to','Royce',33),('assigned_to','Shane',34),('assigned_to','Shelby',35),('assigned_to','Steph',36),('assigned_to','Tyler',37),
('case_level','INITIAL',1),('case_level','RECON',2),('case_level','HEARING',3),('case_level','AC',4),('case_level','FEE PETITION',5),
('claim_type','T2',1),('claim_type','T16',2),('claim_type','CONC',3),('claim_type','DWB',4),('claim_type','DAC',5),('claim_type','AUX',6),
('win_sheet_status','Started',1),('win_sheet_status','Finished',2),
('fees_confirmation','Paid In Full',1),('fees_confirmation','Partial Payment',2),('fees_confirmation','Pending (full/partial)',3),('fees_confirmation','No Fees Due',4),('fees_confirmation','Overpaid',5),
('case_status','Ready for Review',1),('case_status','For follow-up',2),('case_status','FEE O/PMPT XVI',3),('case_status','O/PMPT II & XVI',4),('case_status','O/PAID USER $120',5),('case_status','NEED AUX FEE',6),('case_status','FIX YOUR WIN SHEET',7),('case_status','FEE',8),('case_status','FEE PD BUT O/PD',9),
('approved_by','DeAnne',1),('approved_by','Reviewing',2),('approved_by','Lori',3),('approved_by','Georgia',4)
ON CONFLICT ("category","name") DO NOTHING;
