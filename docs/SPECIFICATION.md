# Lista Escolar — product and technical specification

**Status:** Requirements specification for the first public release

**Audience:** Product owners, designers, developers, and reviewers

**Language of this document:** English. The first release of the application is in Spanish.

This document consolidates the decisions made so far. Where an idea changed during discovery, the final decision is recorded as the requirement. Questions that have not been decided are listed explicitly instead of being treated as completed requirements. Design images and database experiments in this repository are prototypes; they do not mean that the corresponding application features have already been implemented.

## 1. Product overview

**Lista Escolar** is a web application for creating, maintaining, finding, sharing, and printing school-supply lists. Its primary audience is Chilean schools and their communities. A teacher, parent, or another signed-in person can create a list for a class; the application does not require the creator to have a teacher role.

The main goals are:

- Make it fast and straightforward to create an accurate supply list.
- Help parents find and use the appropriate list for their school, class, and school year.
- Offer reusable generic supplies, templates, copying, and spreadsheet import so creators do not have to type everything repeatedly.
- Produce useful, readable PDFs and keep people informed when a published list changes.
- Allow community feedback while making clear that popularity alone does not prove that a list is correct.

Lists describe the supplies for a **whole class**, not personalized requirements for an individual student. The app is free for everyone, and the first launch is intended to be open to the public rather than restricted to a pilot. No target launch date or user-volume estimate has been set.

The working app name is **Lista Escolar**. The preferred domain is **`listacole.cl`**, subject to confirming availability and registering it. The display name and the domain do not need to be identical.

## 2. Scope of the first release

The first release includes all of the following:

1. Public and private lists; creation, autosaved drafts, editing, publication, version history, archiving, and deletion.
2. A searchable, brand-independent supply catalog with categories, subcategories, attributes, aliases, custom supplies, and administrator review.
3. Reuse through grade-level templates and copying existing lists.
4. Import from Excel and CSV, with column mapping, generic-item matching, and a review step.
5. Public search and shareable links; restricted access and collaboration for private lists.
6. PDF preview and download with selectable layouts, paper size, and color mode.
7. Accounts, Google sign-in, email verification, comments, upvotes, reports, and moderation.
8. Following lists by email, personal checklists, and version-aware progress.
9. An administrator portal, including catalog and store-product match review.
10. A mobile-friendly Spanish interface and optional installation as a progressive web app (PWA).

Teacher verification and badges are **not** included in the first release. Matching store products are visible to administrators for review, but parents are not shown those products and cannot purchase them through the first release.

## 3. People, accounts, and access

### 3.1 Roles

| Role | Purpose |
| --- | --- |
| Visitor | Can find and view public lists and download their PDFs without signing in. |
| Signed-in user | Can create lists, vote, comment, report content, follow lists, and maintain personal checklist progress, subject to the relevant list's access permissions. |
| List creator | Owns a list; can edit and publish it, manage access, control comments, transfer ownership, archive it, and delete it. |
| Collaborator with edit permission | Can edit and publish a list, manage its access, and change its public/private setting. Only the creator can archive or delete it. |
| Administrator | Uses a separate administrative account and portal to manage catalog review, templates, reports, and other administrative users. |

Users are not divided into teacher and parent roles for list creation. A chosen display name identifies a creator publicly; users do not have to expose their real name for this purpose.

### 3.2 Sign-in and verification

- Regular users can sign up and sign in with **email and password** or with **Google**.
- Email-and-password users must verify their email address before creating lists, voting, or commenting.
- Creating a list, voting, commenting, and reporting require sign-in. Viewing a public list does not.
- Personal checklist progress and following a list require sign-in so that they can be saved to the user's account.
- Google sign-in for users and Google Workspace for the application's outgoing email are separate configurations.
- Administrators use a **separate login portal and administrative accounts**, authenticated with a username and password. An existing administrator can create another administrative account through that portal; a normal user does not automatically become an administrator.

The initial administrator bootstrap method and the exact account-recovery flow have not yet been decided. A secure password-reset flow is recommended for email-and-password accounts.

### 3.3 Public and private lists

- New lists default to **public**. A draft is not publicly visible until it is published.
- A public published list can be found through search and opened through a shared link. Anyone can view it; interactive actions still follow the sign-in rules.
- A creator can instead make a list **private**. Only the creator and the users granted access can view it or comment on it. Private lists do not appear in public search.
- The creator or an editing collaborator can change a published list from public to private or private to public.
- For a private list, the creator or an editing collaborator can invite people by email or approve requests submitted through an invitation link. An invitation/request link is not itself unrestricted access; an access request must be approved.
- Private access also needs to protect versions, comments, previews, PDF generation, and other list content. Changing a list to private must not leave its previous versions publicly accessible through old app links.
- A person who already downloaded or otherwise copied a PDF can share that copy outside the application; changing access inside the app cannot recall it.

The exact rules for administrators handling a **reported private list or comment** require a decision: private lists are restricted to selected users, while administrators need enough access to review reports. Administrators must not receive unrestricted private-list access by default merely because of their role.

## 4. List contents and creation

### 4.1 Required list details

Each list requires:

- **School name:** entered as free text.
- **Class or curso:** entered as free text rather than selected from a mandatory fixed list.
- **School year:** required so current and older lists can be distinguished.
- **Supply items:** each item has a name, quantity, and optional note.

A creator can also add **general instructions** for the entire list and optionally upload a **school logo**. General instructions and the optional logo appear in the PDF. The exact allowed image formats and upload limits are not yet decided.

The app validates required information and quantities and presents clear corrections before publication. The exact quantity rules—for example, whether fractional quantities are allowed—remain to be decided.

### 4.2 Creating and organizing supplies

Creators can search a shared supply catalog, select generic supplies, and add their own custom supplies. The app should suggest appropriate categories for selected items almost automatically. Creators can correct the category, move items between categories, and rearrange the list and its contents.

The editing workflow should support quick creation on desktop and mobile, including:

- Search and selection while typing.
- Editing quantities and item notes.
- Automatic draft saving so interruptions do not discard progress.
- Reviewing a list before publication and previewing its PDF.
- Starting from an existing list or a grade-level template when helpful.

The list stores the information necessary to render a published version even if a catalog item is later renamed, merged, or removed from the shared catalog.

### 4.3 Reusing lists and templates

- A user can duplicate one of their previous lists, such as the previous year's list, and edit the copy.
- A user can copy an existing public list as a starting point and adapt it for their school, class, and year.
- Shared **grade-level templates** provide general starting lists for Chilean school levels. Administrators create and maintain these shared templates.
- A creator can change template items, quantities, categories, and other details before publishing their own list. A template is a starting point and does not claim to be an official list for every school.
- Regular users do not publish shared grade-level templates in the first release. They can still copy public lists.

## 5. Generic supply catalog

### 5.1 Structure and attributes

Supplies are organized in **categories → subcategories**, with structured attributes describing differences that matter when selecting an item. The exact taxonomy and placement of individual supplies are delegated to the implementation and can be revised as the catalog is curated.

For example:

- Category: **Cuadernos**.
- Possible subcategories: **cuadriculados**, **rayados/de línea**, **composición**, **caligrafía**, and **croquis**, where those groupings are useful for browsing.
- Attributes can include format or size, number of sheets, grid spacing such as **5 mm** or **7 mm**, and orientation where relevant.

Other supply families need appropriate categories and attributes of their own. Attributes should be structured and typed where practical so users can browse and distinguish variants without creating a separate category for every size or measurement.

Catalog items are **generic and brand-independent**. Products that differ only by brand should generally map to the same generic supply. Meaningful differences—such as notebook format, sheet count, ruling, grid spacing, and croquis—must remain distinguishable. A generic catalog item can therefore correspond to multiple store products.

### 5.2 Alternative names and custom items

- The catalog supports alternative names so people can find the same supply using different terms or abbreviations.
- When adding a custom supply, a creator chooses whether it remains only on their list or is shared with the catalog.
- A shared custom item appears in the shared catalog **immediately**, visibly marked as **pending review**.
- An administrator can approve it as a new official catalog item, determine that it matches an existing item, or remove/reject it from the shared catalog because it is unsuitable.
- When an item matches an existing supply under another name, its submitted name can become a searchable alternative name.
- Removing or merging a shared catalog item must not silently remove an item from an existing list or rewrite a previously published list version.
- List-specific custom items do not become shared catalog entries unless their creator chooses to share them.

### 5.3 Initial data and store-product mapping

The store's PostgreSQL dump, `melqui.dump`, is the **one-time starting dataset**. The app's catalog is not continuously synchronized with the store in the first release. The dump includes product names, brands, product variants, categories, images, and other store data; the app should import only the catalog information needed for this project rather than unrelated customer, order, or payment data.

The store catalog is not clean enough to publish directly: many items have missing categories, abbreviated names, brands, model numbers, or other inconsistent descriptions. The initial import must normalize generic names and organize supplies while retaining original source identifiers and names where available. Ambiguous classifications and matches need review rather than silent guessing.

Administrators can:

- See which store products are linked or suggested for a generic supply.
- Search or inspect source product information needed for that review.
- Add, change, and remove links.
- Review suggested links; a suggestion becomes a confirmed link **only after administrator approval**.

The system should preserve enough source information to support later store integration, including product identifiers and names and, where available, variants and image references. Source prices are snapshot data and must not be represented as live prices without a future update mechanism.

For the first release, parents do **not** see matching store products, product images, prices, stock, or purchase links. There is no checkout or store purchase flow. The exact future parent-facing store experience remains undecided.

## 6. Spreadsheet import

Users can import both **Excel `.xlsx`** and **CSV** files. No representative spreadsheet is available yet, so the importer must not assume a single pre-existing store-specific layout.

The expected workflow is:

1. Upload a spreadsheet and select the columns for item name, quantity, and optional note.
2. Read the rows and present a preview before modifying the list.
3. Compare imported names with generic catalog names, approved alternative names, and store products already linked to generic supplies.
4. Suggest a brand-independent catalog item where the meaning is clear. Preserve important attributes such as notebook format, sheets, ruling, and grid spacing.
5. Show all rows, quantities, and notes for review. Require the user to resolve ambiguous, missing, or conflicting matches and invalid quantities; do not silently guess important attributes.
6. Allow the user to correct a suggestion, choose another catalog item, or create a generic custom item. For a custom item, the existing choice between list-only and shared/pending applies.
7. Add the reviewed items to the list only after the user confirms the import.

For example, an imported “Cuaderno universitario Torre, 100 hojas, cuadriculado 7 mm” can be suggested as “Cuaderno universitario, 100 hojas, cuadriculado 7 mm.” The brand is not part of the generic item, but the meaningful specifications remain. An item does not need a confirmed store-product link in order to be used in a list.

Matching implementation details, spreadsheet size limits, handling of multiple sheets and duplicate rows, and the exact threshold for a clear match remain to be designed. Automated matching must not bypass the administrator approval required for store-product links.

## 7. Publication, versions, and notifications

### 7.1 Drafts and publishing

- Editing takes place in an autosaved draft. A creator or editing collaborator explicitly publishes the draft when ready.
- Publication creates a new published version. Earlier versions remain available to people who have access and are clearly identified as older or outdated when a newer version exists.
- The main share link shows the **latest published version**. Earlier versions should remain individually accessible through the app's version history.
- A change to the current list's access permissions applies to access to its versions as well.
- A published version retains its list content as it was published. Later catalog corrections do not silently rewrite it. Necessary privacy, moderation, and account-deletion actions must still be possible.
- Votes and comments identify the version to which they belong.

The application must handle concurrent edits safely because multiple collaborators can edit and publish; the specific conflict-resolution experience has not yet been chosen.

### 7.2 Following a list

A signed-in user can follow a list and receive an email when a **new version is published**. The email should identify the list and lead the recipient to the applicable current version. Following should be reversible, and access to a private list must still be checked when the recipient opens it.

Google Workspace is the intended outgoing email service for launch. Email verification, invitations, and list-update notifications are application email use cases. Implementation should account for provider limits, failures, and bursts of update notifications without treating an email-provider acceptance response as proof that the message reached the recipient's inbox.

The app will continue to use email for these notifications; push notifications have not been requested for the first release.

## 8. Search, discovery, and feedback

### 8.1 Public search

- Public lists are searchable by school name and class, with the school year used to distinguish and match relevant lists.
- Search results show only the **latest published version** of each list, not every historical version.
- Rank results first by how well school, class, and year match; among close matches, order by the current version's upvotes, using publication date to break ties.
- Offer a **most recent** sort option as an alternative.
- Display enough context to judge a result, including school, class, year, vote count, and publication date.
- Administrators can associate variations of a school name with the same school to improve matching. School and class entry remain free text; such associations must avoid conflating different schools with similar names.

An upvote is community feedback, not proof that the list is complete, correct, school-approved, or current.

### 8.2 Upvotes

- Voting requires sign-in.
- A user can give a version one upvote and can remove it later.
- Each newly published version starts with a fresh upvote count. Votes on older versions remain visible with those versions, and users can vote again on the new one.
- Search ranking uses votes for the version being displayed, rather than silently treating an older version's votes as votes for the current one.
- When a user deletes their account, their upvotes are removed and affected counts are updated.

Whether voting should also be enabled on private lists has not been explicitly decided.

### 8.3 Comments and reports

- Commenting requires sign-in and access to the list. Comments are associated with the published version they refer to.
- The creator can turn comments on or off for a list and can remove comments from their own list.
- Signed-in users can report lists or comments for administrator review.
- Administrators can hide reported lists or comments while reviewing them. The first release needs an administrative way to see and act on reports.
- When an account is deleted, its comments are deleted. If needed to keep a conversation understandable, show a neutral **“Comentario eliminado”** placeholder rather than the deleted comment's content.

The visibility of existing comments after comments are disabled, the exact report outcomes, and moderation access to reported private content remain open design decisions.

## 9. Personal checklist progress

Parents and other signed-in users can check off items in the app and save their **own** progress. This is separate from editing or publishing the shared list and must not change another person's progress.

When a new version is published:

- Carry checkmarks forward for unchanged items.
- Mark new or changed items for the user to review.
- Keep the displayed progress aligned with the version the person is viewing.

The precise rules for identifying an unchanged item—for example, how to treat a note-only change, a category move, or a quantity change—need to be defined during implementation. The first release does not require offline checklist editing or offline synchronization.

## 10. PDF generation and visual design

### 10.1 PDF content and choices

Users can preview and download a PDF for an accessible list. Each PDF should include:

- School name, class, and school year.
- The optional school logo when supplied.
- Supplies grouped in their selected categories, with item names, quantities, optional item notes, and a printable checkbox for each item.
- General list instructions.
- The published version and publication date.
- A link to the online list so a reader can check for a newer version.

The default paper size is **Carta / US Letter**; users can choose **A4**. PDFs are primarily designed in color, and a **black-and-white variant** is also available. Signed-in users' layout and color preferences are saved for future downloads, and users can override them for an individual download. Whether paper-size preference is also saved has not been explicitly decided.

Users choose among PDF layouts when generating a PDF. The three latest approved directions are:

1. [Two-column grouped checklist](../design/concepts/pdf/alternativas/04-cuaderno-doble-color.pdf).
2. [School-information sidebar and vertical checklist](../design/concepts/pdf/alternativas/05-barra-lateral-color.pdf).
3. [Individual supply cards](../design/concepts/pdf/alternativas/06-fichas-color.pdf).

The examples are design concepts, not complete production PDF templates. Real PDFs must accommodate variable content, longer notes, optional logos, and lists that span multiple pages without omitting information. Whether a PDF reflects a signed-in user's saved checklist progress or always starts with empty checkboxes remains undecided.

### 10.2 Interface direction

The selected visual direction combines the **calm and organized** and **warm and playful** concept styles. Reference interface mockups are available for:

- [Finding lists](../design/concepts/interfaces/01-buscar-listas.png).
- [Creating and editing a list](../design/concepts/interfaces/02-crear-lista.png).
- [Viewing a published list](../design/concepts/interfaces/03-ver-lista.png).
- [Sharing and collaboration](../design/concepts/interfaces/04-compartir-y-colaborar.png).

Mockup text and incidental controls are illustrative. This specification takes precedence where an image differs from an agreed behavior—for example, private lists can be shared with chosen users, and users do not select a teacher or parent role.

## 11. Archiving, deletion, and ownership transfer

### 11.1 Lists

- Only a list's **creator** can archive or delete it; collaborators cannot perform either action.
- **Archive:** preserve the list and earlier versions for people who have permission to access them, and clearly mark the list as no longer maintained.
- **Delete:** remove the list from the app after a clear confirmation. Its app links, versions, comments, and saved checklists will no longer be accessible through the app.
- Previously downloaded PDFs cannot be recalled from recipients' devices.

Whether archived lists appear in public search, and whether an archived list can later be restored or edited, are not yet decided.

### 11.2 Accounts

Users can delete their own accounts through the app. The deletion flow must explain the effects before confirmation.

- **Public lists:** remain available without the creator's display name, including on historical versions. Use a neutral label such as **“Usuario eliminado.”** A creator may transfer ownership of a public list to a collaborator before deleting their account.
- **Private lists:** the creator can transfer them to a collaborator before deleting their account. If there is no collaborator to receive a private list, the creator can delete that list and continue with account deletion.
- **Comments:** delete the user's comments, with a neutral placeholder where needed for conversation context.
- **Upvotes:** remove the user's votes and update the affected version counts.

Removing a display name does not guarantee that a retained list contains no identifying information. The product needs a way to address personal information that remains in list content. The precise process for ownership and ongoing management of a retained public list when no collaborator receives ownership also needs a decision.

## 12. Administration

The administrator portal is separate from the regular user login and supports:

- Creating other administrative accounts.
- Managing the shared supply taxonomy, generic items, and alternative names.
- Reviewing shared custom supplies and approving, merging, or rejecting them.
- Reviewing suggested generic-to-store product matches and adding, changing, removing, or approving links.
- Creating and maintaining grade-level templates.
- Reviewing reports and hiding reported lists or comments while investigating.
- Associating school-name variants for search and other school matching.

Administrative review of store suggestions and shared supplies must remain distinguishable from user-facing upvotes. An administrator's approval of a generic supply or product match does not imply that a school list is official.

The process for the first administrative account, finer-grained admin permissions, and additional moderation actions such as suspending users are not yet specified.

## 13. Platform, infrastructure, and data

### 13.1 Agreed technologies

- **Frontend:** Angular and TypeScript.
- **Backend:** Rust, providing the application API, authorization, and business rules.
- **Database:** PostgreSQL for lists, supplies, accounts, versions, feedback, permissions, and related data.
- **Email:** Google Workspace for launch; the exact SMTP-relay or Gmail API integration can be chosen during implementation.
- **Hosting:** Vultr has been considered, but no hosting provider or production deployment arrangement has been selected.
- **Development:** Rust and Angular can run directly on Linux. PostgreSQL can be installed locally; an optional Docker Compose setup for PostgreSQL is also acceptable. Docker is not a prerequisite for all development.

The project owner has created a local PostgreSQL database named **`escolar`** for later use. Connection details and its current contents have not been established in this specification. It should be inspected before any changes are made.

An earlier catalog experiment in this workspace used a **separate**, isolated local PostgreSQL cluster under `.local/` and a database named `lista_escolar`; it did not use the owner's `escolar` database. Its schema and import scripts are prototypes, not a substitute for implementing this specification.

### 13.2 Data model responsibilities

The implementation will need persistent representations for at least:

- Regular users, authentication methods, display names, verification state, and PDF preferences.
- Separate administrative identities and administrative access.
- School-name associations and aliases, while allowing free-text school and class entry.
- Categories, subcategories, typed attributes, generic supplies, alternative names, and shared-item review states.
- The imported store-product snapshot, variants and other source references, suggested matches, confirmed matches, and review decisions.
- Lists, their creator and collaborators, access grants and requests, visibility, drafts, immutable published content, version history, and optional logos.
- Grade-level templates, list copies, and spreadsheet-import review data as needed by the workflow.
- Version-specific upvotes and comments, reports and moderation state, following subscriptions, notifications, and user-specific checklist progress.
- Ownership transfers, list archiving/deletion, and account-deletion handling.

The database should enforce relationships, required fields, uniqueness where appropriate, and valid attribute types. The Rust backend must enforce authorization and privacy; client-side interface checks alone are not sufficient. Store product references must not be mistaken for administrator-approved matches until reviewed.

### 13.3 Mobile, PWA, and quality

- The Spanish interface should be usable on phones as well as larger screens, including the list editor, search, shared lists, and PDF options.
- Installation on a supported device's home screen is optional. A user can continue using the site normally in a browser and follow public links without installing it.
- The first version includes a helpful offline message. Editing lists and synchronizing progress require an internet connection; a PDF already downloaded to the device can be used offline.
- Installation flows and platform support vary by browser and device.
- Design and implementation should support accessible, readable forms and controls, including keyboard and touch use.

## 14. Acceptance checkpoints

Before the first release is considered complete, the implementation should demonstrate at least these end-to-end outcomes:

1. A person can sign up, verify an email-and-password account or use Google sign-in, create a class list, and publish it with required school, class, and year details.
2. A visitor can find a public list by school and class, open its latest version, and download a PDF; a private list is inaccessible without an explicit grant.
3. A creator can search generic catalog items, add custom items, choose whether to share them, adjust categories and ordering, and see pending shared items labeled appropriately.
4. An administrator can approve, merge, or reject a pending supply and review a suggested store-product match without automatically publishing unreviewed matches.
5. A user can import `.xlsx` or CSV data, map columns, review every row, resolve ambiguity, and add the confirmed items to a list.
6. A creator or collaborator can publish a changed version. The stable link opens the current version; prior versions remain identifiable, upvotes start fresh, and followers receive a notification.
7. A signed-in parent can save checklist progress and see unchanged checkmarks carried forward while new or changed items are flagged.
8. A user can choose among the PDF layouts, choose Carta or A4 and color or black and white, preview the output, and override saved preferences for one download.
9. The creator can manage private access, invitations, collaborators, and comment availability. Only the creator can archive or delete the list.
10. Signed-in users can vote, comment, and report; administrators can review reports and hide reported content under an agreed private-content policy.
11. Account deletion follows the agreed public-list, private-list, comment, and vote rules without presenting name removal as guaranteed anonymization.
12. The app works as a Spanish-language website on mobile and desktop and can optionally be installed as a PWA on supported devices.

## 15. Open decisions and dependencies

These do not replace the confirmed scope, but they need resolution during planning or implementation:

- Confirm and register `listacole.cl`; no domain availability or trademark conclusion has been established.
- Select hosting, production database arrangement, backups, and operational ownership. The launch audience size and launch date are unknown.
- Establish connection details and inspect the owner's existing `escolar` database before using it.
- Select the specific Google Workspace sending method, configure a verified sending domain, and establish delivery monitoring and handling for provider limits.
- Decide the initial administrator bootstrap and account recovery methods.
- Define a privacy-respecting procedure for administrators to handle reports involving private content.
- Define precise version-to-version checklist matching and whether users can see a detailed change comparison.
- Decide private-list voting, existing-comment visibility after comments are disabled, archived-list discoverability/restoration, and management of retained ownerless public lists.
- Decide quantity constraints, accepted logo formats and limits, spreadsheet limits/multiple sheets/duplicate handling, and whether PDFs include personal checkmarks.
- Obtain real example spreadsheets and, where possible, representative long lists to validate imports and multi-page PDF layouts.
- Continue curating the store-derived catalog. The dump contains many products beyond school supplies; automatic normalization cannot be assumed complete or accurate without review.

## 16. Decisions that supersede earlier ideas

- Account-free list creation was considered, then replaced with **sign-in required** for creation, voting, commenting, and reporting; public viewing remains open.
- English support was considered, then deferred: the first release is **Spanish only**.
- A teacher verification badge was explored, then explicitly deferred to avoid friction. Lists remain community-created, with no teacher badge in the first release.
- Parent-facing store-product information was explored, then deferred. Administrators still need product-linking tools in the first release.
- Self-hosted Stalwart and third-party transactional email were considered; the launch preference is **Google Workspace**.
- The app remains named **Lista Escolar** even though its preferred domain is **`listacole.cl`**.
