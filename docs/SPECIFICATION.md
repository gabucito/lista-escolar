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
| List owner | The current owner can edit and publish an active list, manage access, control comments, transfer ownership, archive or restore it, and delete it. |
| Collaborator with edit permission | Can edit and publish an active list, manage its access, and change its public/private setting. Cannot remove the owner, transfer ownership, archive, restore, or delete the list. |
| Administrator | Uses a separate administrative account and portal to manage catalog review, templates, reports, and other administrative users. |

The creator is the initial owner. After an accepted ownership transfer, owner permissions belong to the **current owner**, not the original creator. Original authorship is attribution, not a permanent access grant. Every list has exactly one current owner, except an archived public list retained after account deletion under section 11.

Users are not divided into teacher and parent roles for list creation. A chosen display name identifies a person publicly; users do not have to expose their real name for this purpose.

### 3.2 Sign-in and verification

- Regular users can sign up and sign in with **email and password** or with **Google**.
- Email-and-password users must verify their email address before creating lists, voting, commenting, or following lists by email. Email invitations must be accepted with a verified account matching the invited address.
- Creating a list, voting, commenting, and reporting require sign-in. Viewing a public list does not.
- Personal checklist progress and following a list require sign-in so that they can be saved to the user's account.
- Google sign-in for users and Google Workspace for the application's outgoing email are separate configurations.
- Administrators use a **separate login portal and administrative accounts**, authenticated with a username and password. An existing administrator can create another administrative account through that portal; a normal user does not automatically become an administrator.

Email-and-password accounts have a password-reset flow using an expiring, single-use email link. Request responses do not disclose whether an address has an account; requests are rate-limited, and a successful reset invalidates existing sessions. Google users recover their Google credentials through Google. Authentication methods must not be linked solely on the basis of an unverified email address.

An operator creates the first administrator through a deployment-side command, with no public bootstrap endpoint or default password. Administrative recovery also uses an operator command after identity verification; it does not turn a regular account into an administrator. Commands must not expose passwords in logs or command-line arguments.

### 3.3 Public and private lists

- Lists created from scratch default to **public**; copies follow section 4.3. A draft and its previews are visible only to the owner and editing collaborators, even when the list is public or other people have permission to view its published versions.
- An active public published list that is not hidden by moderation can be found through search and opened through a shared link. Anyone can view it; interactive actions still follow the sign-in rules.
- An owner can instead make a list **private**. Only the owner and the users granted access can view it or comment on it, subject to the limited report-review procedure below. Private lists do not appear in public search.
- The owner or an editing collaborator can change an active published list from public to private or private to public. Visibility and access changes take effect immediately, independently of draft publication. Archived lists follow the restrictions in section 11.
- For a private list, the owner or an editing collaborator can invite people by email or approve requests submitted through an invitation link. An invitation/request link is not itself unrestricted access; an access request must be approved. Grants default to viewing permission; editing requires an explicit choice. Email invitations are expiring, revocable, and bound to the invited verified account, not merely possession of a forwarded link.
- Following, commenting on, or previously viewing a public list does not create a private-access grant. Switching to private leaves access only for the owner and explicitly granted users.
- Private access protects versions, comments, previews, PDFs, logos, and other list content. Authorization is checked on each content request and mutation, including publication, import confirmation, and retried requests. Changing a list to private must not leave previous versions or generated files publicly accessible through old app links.
- Dynamic list and search responses, previews, PDFs, and uploaded logos use `Cache-Control: no-store` and are excluded from shared/CDN and service-worker caches. The PWA may cache its static application shell, but not list content or checklist data. Logout or an access-denied response clears affected in-memory content; reopening a list requires a fresh access check. The app does not offer offline list storage in this release.
- A person who already downloaded or otherwise copied a PDF can share that copy outside the application; changing access inside the app cannot recall it.

For a **reported private list or comment**, the reporting user must have access when the report is submitted. The reporting flow explains what will be shared with moderators. A report attaches the reported published version, or the reported comment and the minimum relevant context, to a review case. Administrators may inspect that case evidence while it is open; they do not receive a general access grant to the private list, its drafts, unrelated versions, or other private lists. The same limits apply if a reported public list later becomes private. Record who inspected the case and which moderation actions they took. On closure, remove the case's content copies and retain a minimal decision audit; privacy removals also apply to open case evidence.

## 4. List contents and creation

### 4.1 Required list details

Each list requires:

- **School name:** entered as free text.
- **Class or curso:** entered as free text rather than selected from a mandatory fixed list.
- **School year:** required so current and older lists can be distinguished.
- **Supply items:** at least one item, each with a name, quantity, unit, and optional note.

School **comuna and region are optional** but encouraged to distinguish schools with the same name. Selecting a comuna establishes its region. School and class entry remain free text; a school-directory match is not a prerequisite for publication. When supplied, locality appears on the list, in search results, and in the PDF.

A creator can also add **general instructions** for the entire list and optionally upload a **school logo**. General instructions and the optional logo appear in the PDF. Accept PNG, JPEG, and WebP uploads up to 2 MiB and 4096 pixels in each dimension. Decode and store a sanitized raster image; reject invalid files and unsupported formats. Each published version retains its own logo reference so replacing a draft logo does not change previous versions.

The app validates required information and quantities before publication. Quantity rules apply equally to manual entry, imports, templates, and copied lists:

- Store the quantity and its unit separately. Counted supplies use whole numbers from 1 to 9,999. Supported count units are **unidad** (the default), **caja**, **paquete**, **par**, **set**, **hoja**, **pliego**, and **rollo**.
- Measured quantities use **m**, **cm**, **L**, **ml**, **kg**, or **g** and allow positive decimal values up to 9,999.999, with at most three decimal places. Use exact decimal values; do not silently round an invalid input.
- Spanish decimal-comma input is supported. Imports expose the numeric format in the preview and require correction of ambiguous separators instead of guessing a thousands separator.
- Packaging size is part of the supply description or attributes: **2 cajas de 12 lápices** means two boxes, not two individual pencils. Never silently convert package counts into individual units. Show units consistently in editing, review, checklists, and PDFs.

### 4.2 Creating and organizing supplies

Owners and editing collaborators can search a shared supply catalog, select generic supplies, and add custom supplies to an active list. The app should suggest appropriate categories for selected items almost automatically. Editors can correct the category, move items between categories, and rearrange the list and its contents.

The editing workflow should support quick creation on desktop and mobile, including:

- Search and selection while typing.
- Editing quantities, units, and item notes.
- Automatic draft saving so interruptions do not discard progress.
- Reviewing a list before publication and previewing its PDF.
- Starting from an existing list or a grade-level template when helpful.

The list stores the information necessary to render a published version even if a catalog item is later renamed, merged, or removed from the shared catalog.

Each item occurrence has a stable identity within its list, independent of its name, position, category, or catalog reference. Two rows using the same catalog supply are distinct occurrences. Editing or moving a row preserves its identity; adding a row or removing and re-adding one creates a new identity. Checklist migration uses these identities and published content, as defined in section 9.

### 4.3 Reusing lists and templates

- A user can duplicate one of their previous lists, such as the previous year's list, and edit the copy.
- A user can copy an existing public list as a starting point and adapt it for their school, class, and year.
- Shared **grade-level templates** provide general starting lists for Chilean school levels. Administrators create and maintain these shared templates.
- A creator can change template items, quantities, categories, and other details before publishing their own list. A template is a starting point and does not claim to be an official list for every school.
- Regular users do not publish shared grade-level templates in the first release. They can still copy public lists.

Copies and template-based lists start as a new draft owned by the person creating the copy, with new list and item identities. They do not inherit collaborators, access links, votes, comments, followers, or checklist progress. Duplicating one's own private list preserves private visibility; other new lists default to public drafts. Copying a public list does not imply endorsement by its original author or school.

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
- When adding a custom supply, the person adding it chooses whether it remains only on the list or is shared with the catalog.
- A shared custom item appears in the shared catalog **immediately**, visibly marked as **pending review**.
- An administrator can approve it as a new official catalog item, determine that it matches an existing item, or remove/reject it from the shared catalog because it is unsuitable.
- When an item matches an existing supply under another name, its submitted name can become a searchable alternative name.
- Removing or merging a shared catalog item must not silently remove an item from an existing list or rewrite a previously published list version.
- List-specific custom items do not become shared catalog entries without an explicit sharing choice by an authorized owner or editor.

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

1. Upload a spreadsheet, select a worksheet for `.xlsx`, and map columns for item name, quantity, optional unit, and optional note. When no unit column exists, show **unidad** as a proposed default and require correction of packaging or measurement ambiguity.
2. Read the rows and present a preview before modifying the list.
3. Compare imported names with generic catalog names, approved alternative names, and store products with administrator-approved links to generic supplies. Pending catalog suggestions remain visibly marked as pending.
4. Suggest a brand-independent catalog item where the meaning is clear. Preserve important attributes such as notebook format, sheets, ruling, and grid spacing.
5. Show all nonempty rows, source row numbers, quantities, units, and notes for review. Require the user to correct or explicitly exclude invalid rows and resolve ambiguous, missing, or conflicting matches; do not silently guess important attributes.
6. Allow the user to correct a suggestion, choose another catalog item, or create a generic custom item. For a custom item, the existing choice between list-only and shared/pending applies.
7. Add the reviewed items to the draft only after the user confirms the import. Commit the selected rows and any requested shared custom items together, using the reviewed draft revision. A conflict or rejected confirmation leaves the draft and catalog unchanged; retrying an accepted confirmation does not add duplicate rows or shared items.

For example, an imported “Cuaderno universitario Torre, 100 hojas, cuadriculado 7 mm” can be suggested as “Cuaderno universitario, 100 hojas, cuadriculado 7 mm.” The brand is not part of the generic item, but the meaningful specifications remain. An item does not need a confirmed store-product link in order to be used in a list.

The initial upload limit is 10 MiB, with at most 1,000 nonempty data rows in the selected sheet or CSV. Select one worksheet per import; additional sheets can be imported separately. Bound decompression, cell counts, and parsing work as well as compressed file size, and fail with a clear message before changing the draft. Accept UTF-8 CSV, including a byte-order mark, with an explicit Windows-1252 fallback; the preview lets users correct delimiter and numeric-format choices. Spreadsheet formulas in mapped cells must be replaced with values before import; the application does not execute formulas or follow external workbook links.

Skip fully blank rows and flag duplicates, but keep duplicate rows separate unless the user explicitly removes or combines them during review. Only combine quantities after the supply, unit, packaging, and notes have been reconciled. A repeated supply may intentionally represent separate requirements. Uploads and temporary review data are removed after completion or cancellation, or expire after 24 hours; previews do not publish shared supplies before confirmation.

Matching algorithms and thresholds can be selected during implementation, but every included row remains subject to user review. Automated matching must not bypass administrator approval for store-product links.

## 7. Publication, versions, and notifications

### 7.1 Drafts and publishing

- Editing takes place in one shared autosaved draft per list. The owner or an editing collaborator explicitly publishes the draft when ready. Unpublished edits do not change what readers see.
- Publication creates a new published version. Earlier versions remain available to people who have access and are clearly identified as older or outdated when a newer version exists.
- The main share link shows the **latest published version**. Earlier versions should remain individually accessible through the app's version history.
- A change to the current list's access permissions applies to access to its versions as well.
- A published version retains its list content as it was published. Later catalog corrections do not silently rewrite it. Necessary privacy, moderation, and account-deletion actions must still be possible.
- Votes and comments identify the version to which they belong.

Every draft save includes the revision the editor started from. If another save has changed that revision, reject the stale save without overwriting either person's work. Keep the unsaved edits visible in the current editor and offer the latest saved content for comparison and deliberate reapplication. Show saving, saved, disconnected, and conflict states; do not present unsaved changes as saved. Automatic merging and live simultaneous text editing are not required for this release.

Publication includes the exact draft revision reviewed by the publisher and the expected current published version. Recheck both in the publication transaction; a revision mismatch requires review again, and publication is refused if the actor no longer has editing permission or the list is archived or hidden. Commit the immutable version, the latest-version pointer, and the durable notification event together. A retry with the same publication request identifier returns the original result without another version or notification event. Simultaneous publication requests cannot both publish the same draft as separate versions, and publishing content identical to the latest version is a no-op. Access changes alone do not create a new content version.

Publication and import request identifiers are scoped to their actor, list, and operation, and bound to the original submitted payload. Reject reuse with a different payload, and check current authorization before returning a saved result. Removing temporary import data must not remove the record needed to recognize an already committed request.

### 7.2 Following a list

A signed-in user with a verified email address can follow an accessible active list and receive an email when a **new version is published**. Public-list messages can identify the school and class; private-list messages use a generic update notice and an authenticated link, without school, class, supply, or comment content. Links lead to the latest published version, with access checked again when opened. Users can stop following from the app or an unsubscribe link that only cancels that subscription.

Queue at most one notification job per follower and published version. Before dispatch, recheck that the account and subscription still exist, the list is active and visible to that recipient, and any required private-access grant is current. Removing a follower's viewing access, making a list private without a grant for that follower, deleting the list, or unfollowing cancels the affected pending jobs and subscriptions. Downgrading an editor to a viewer does not cancel a subscription if viewing access remains. A later grant does not silently re-subscribe the person. Archiving cancels pending jobs and pauses remaining subscriptions until restoration and a subsequent publication. Emails already handed to the provider cannot be recalled after access changes.

Google Workspace is the intended outgoing email service for launch. Email verification, invitations, and list-update notifications are application email use cases. Track queue, provider acceptance, failures, and uncertain delivery outcomes; use bounded retries and monitoring for provider limits and bursts. A provider acceptance response is not proof of inbox delivery, and an uncertain response must not be treated as a definite failure and blindly resent. Publication remains successful if delivery is delayed or fails.

The app will continue to use email for these notifications; push notifications have not been requested for the first release.

## 8. Search, discovery, and feedback

### 8.1 Public search

- Active public lists are searchable by school name and class, with the school year used to distinguish and match relevant lists. Offer comuna and region filters when locality is available. Archived and moderation-hidden lists are excluded from public search.
- Search results show only the **latest published version** of each list, not every historical version.
- Rank results first by how well school, class, year, and any supplied locality match; among close matches, order by the current version's upvotes, using publication date to break ties.
- Offer a **most recent** sort option as an alternative.
- Display enough context to judge a result, including school, known comuna and region, class, year, vote count, and publication date. Missing locality is shown as unspecified, never inferred from a matching name.
- Administrators can associate variations of a school name with the same school to improve matching. School and class entry remain free text. Associations must consider locality and available school evidence; identical names alone do not establish that two schools are the same. Preserve the list's entered school details when changing search associations.

An upvote is community feedback, not proof that the list is complete, correct, school-approved, or current.

### 8.2 Upvotes

- Voting requires sign-in.
- A user can give a version one upvote and can remove it later.
- Each newly published version starts with a fresh upvote count. Votes on older versions remain visible with those versions, and users can vote again on the new one.
- Search ranking uses votes for the version being displayed, rather than silently treating an older version's votes as votes for the current one.
- When a user deletes their account, their upvotes are removed and affected counts are updated.

Voting is available on active public and private lists under the same account rules, but a private-list vote also requires current access. Private votes are visible only to authorized readers and do not contribute to public search while the list is private. Archiving prevents new votes; users may still remove their own votes, and account deletion still removes them.

### 8.3 Comments and reports

- Commenting requires sign-in and access to the list. Comments are associated with the published version they refer to.
- The owner can turn comments on or off for a list and can remove comments from their list. Disabling comments prevents new comments; existing comments remain readable to authorized viewers. Authors can delete their own comments even when new comments are disabled.
- Signed-in users can report lists or comments for administrator review.
- Administrators can hide reported lists or comments while reviewing them. The first release needs an administrative way to see and act on reports.
- When an account is deleted, its comments are deleted. If needed to keep a conversation understandable, show a neutral **“Comentario eliminado”** placeholder rather than the deleted comment's content.

Reports may be dismissed with a reason, resolved by restoring content, or upheld with continued hiding or removal of the reported content. Hiding a list blocks reader access to its app links, published versions, previews, PDFs, and logos as well as removing it from search. Owners and editors retain access to the moderation status and, on an active list, its draft; publication is blocked until an administrator lifts the restriction. Archived drafts remain read-only. Private-content review follows the case-limited access in section 3.3. Archived lists remain reportable, including ownerless lists, but do not accept new comments.

## 9. Personal checklist progress

Parents and other signed-in users can check off items in the app and save their **own** progress. This is separate from editing or publishing the shared list and must not change another person's progress.

Progress is stored per user, list-item occurrence, and published version. Stable row identities distinguish repeated supplies. Apply the following rules at each version transition:

| Change | Checklist behavior |
| --- | --- |
| Same item requirements; only order or category changes | Carry the checkmark and any unresolved review flag forward. |
| Supply name, meaningful attributes, packaging, quantity, unit, or item note changes | Reset the checkmark and flag the item for review, even if the quantity decreases. |
| Added item, including removal followed by re-addition | Start unchecked and flag as new. |
| Removed item | Exclude it from the current progress count; retain its state only with earlier versions. |
| School details, logo, or general instructions change | Keep item checks and show a list-level change notice; instruction changes remain visible for review. |

Show a concise summary of added, changed, and removed items since the user's last viewed version, along with changed general instructions or school details. A full side-by-side version comparison is not required for the first release. Users can acknowledge review flags separately from checking off an item.

Handle skipped versions in order: a requirement change must not be overlooked just because a later version returns to its original wording. Updating progress on an older version never overwrites saved progress on a newer one. Catalog renames and merges alone do not reset progress because they do not rewrite published item content. Personal progress remains editable on an accessible archived list without changing the shared list. The first release does not require offline checklist editing or offline synchronization.

## 10. PDF generation and visual design

### 10.1 PDF content and choices

Users can preview and download a PDF for an accessible list. Each PDF should include:

- School name, known comuna and region, class, and school year.
- The optional school logo when supplied.
- Supplies grouped in their selected categories, with item names, quantities and units, optional item notes, and a printable checkbox for each item.
- General list instructions.
- The published version and publication date.
- A link to the online list so a reader can check for a newer version.

The default paper size is **Carta / US Letter**; users can choose **A4**. PDFs are primarily designed in color, and a **black-and-white variant** is also available. Signed-in users can save layout, paper-size, and color preferences for future downloads. An individual download can override these without changing saved defaults unless the user chooses to save the new preferences.

Users choose among PDF layouts when generating a PDF. The three latest approved directions are:

1. [Two-column grouped checklist](../design/concepts/pdf/alternativas/04-cuaderno-doble-color.pdf).
2. [School-information sidebar and vertical checklist](../design/concepts/pdf/alternativas/05-barra-lateral-color.pdf).
3. [Individual supply cards](../design/concepts/pdf/alternativas/06-fichas-color.pdf).

The examples are design concepts, not complete production PDF templates. Real PDFs must accommodate variable content, longer notes, optional logos, and lists that span multiple pages without omitting or clipping information. Continue long content across pages, keep category headings with an item, and repeat enough list/version identification to recognize separated pages. Checkboxes are always empty in first-release PDFs, independently of personal progress in the app.

Draft previews are restricted to the owner and editors and clearly marked **“Borrador”** instead of presenting a publication version or date. Downloads from an older published version identify that version; the online link still allows readers to check the latest accessible version. Archived-list downloads indicate that the list is no longer maintained.

### 10.2 Interface direction

The selected visual direction combines the **calm and organized** and **warm and playful** concept styles. Reference interface mockups are available for:

- [Finding lists](../design/concepts/interfaces/01-buscar-listas.png).
- [Creating and editing a list](../design/concepts/interfaces/02-crear-lista.png).
- [Viewing a published list](../design/concepts/interfaces/03-ver-lista.png).
- [Sharing and collaboration](../design/concepts/interfaces/04-compartir-y-colaborar.png).

Mockup text and incidental controls are illustrative. This specification takes precedence where an image differs from an agreed behavior—for example, private lists can be shared with chosen users, and users do not select a teacher or parent role.

## 11. Archiving, deletion, and ownership transfer

### 11.1 Lists

- Only a list's **current owner** can archive, restore, or delete it through the normal list controls; collaborators cannot perform these actions. Administrative moderation and the automatic account-deletion rules below still apply.
- **Archive:** preserve the list and earlier versions for authorized readers, clearly mark it as no longer maintained, and remove it from public search. Shared content and any draft become read-only; prevent publication, new comments, and new votes. Existing links, PDFs, readable comments, and personal checklists remain available subject to access and moderation rules. No new following subscriptions are accepted while archived.
- An archived list's current owner may manage its access and visibility, transfer ownership, delete it, or restore it. Collaborators cannot change archived-list access or visibility. Restoring returns it to active use without publishing draft changes or creating a new version; public search resumes only for a public list with a published version that is not hidden by moderation.
- **Delete:** remove the list from the app after a clear confirmation. Its app links, versions, comments, saved checklists, invitations, and generated files become inaccessible immediately, and pending notifications are canceled. A stale save, publication, import, or background job cannot recreate a deleted list.
- Previously downloaded PDFs cannot be recalled from recipients' devices.

Archiving does not itself change visibility, erase history, or publish an existing draft. An unpublished archived draft remains restricted to the owner and editors. An ownerless archive cannot be restored or claimed through the ordinary app; users can copy its public published content into a new list they own.

### 11.2 Ownership transfer

The current owner may offer ownership to an existing collaborator with a verified account. The recipient must explicitly accept before ownership changes. An offer is revocable and expiring; a pending offer does not confer owner permissions or count as a completed transfer during account deletion.

Acceptance atomically changes the sole owner, records the transfer, and makes the former owner an editing collaborator. The new owner can subsequently change that grant. Recheck both accounts, the current owner, and the recipient's collaborator grant at acceptance; canceled, expired, stale, or repeated acceptance requests cannot create multiple owners. Transfer does not publish a version, change visibility, or rewrite original authorship. If the list is archived, it remains archived until its new owner restores it.

### 11.3 Accounts

Users can delete their own accounts through the app. Before confirmation, show the affected owned lists, completed and pending transfers, and what will be retained or deleted. Recheck this disposition at confirmation so a concurrent transfer cannot silently change what the user approved. Account deletion must not depend on another person accepting a transfer: the user can cancel deletion to wait, or explicitly confirm the fallback disposition below.

- **Public lists with a published version:** if ownership has not already been transferred, retain the published content and history as an **ownerless, archived, read-only list**, accessible through existing links and excluded from public search. Discard its unpublished draft and cancel pending transfers, invitations, following subscriptions, and notifications. Existing collaborators can still read it but cannot edit, publish, restore it, or assume ownership automatically. Existing moderation restrictions remain in force, and moderation and privacy removal remain available.
- **Private lists:** transfer ownership before deletion if they should be retained. Any still owned by the deleting account are deleted as part of the explicitly confirmed account-deletion flow, even if collaborators exist. A pending transfer is insufficient.
- **Unpublished lists:** delete any still owned by the account, regardless of their intended visibility; private draft content never becomes a public archive.
- **Lists already transferred to another owner:** retain their existing lifecycle and visibility. Remove the deleted person's collaborator access without changing the new owner's rights.
- **Attribution:** remove the account's display name wherever it is attributed in retained lists and historical versions, including previously transferred lists, and use **“Usuario eliminado.”** Invalidate generated files that contain the removed attribution before they can be served again.
- **Comments:** delete the user's comments, with a neutral placeholder where needed for conversation context.
- **Upvotes:** remove the user's votes and update the affected version counts.
- **Other personal state:** remove checklist progress, following subscriptions, PDF preferences, access grants, pending invitations and requests associated with the account, and authentication credentials. Revoke sessions and reset/verification tokens and cancel queued emails to the account.

Removing a display name does not guarantee that retained list text or logos contain no identifying information. Provide a privacy-report action, including from the account-deletion review, so a person can identify content needing removal. Such a case remains actionable after account deletion without exposing the person's identity publicly. Administrators can redact the identified content or remove affected versions/files under the case procedure, including in ownerless archives. Privacy removals take precedence over snapshot immutability, invalidate generated artifacts, and leave a minimal action audit without retaining the removed content in it. Independently downloaded or copied material cannot be recalled.

## 12. Administration

The administrator portal is separate from the regular user login and supports:

- Creating other administrative accounts.
- Managing the shared supply taxonomy, generic items, and alternative names.
- Reviewing shared custom supplies and approving, merging, or rejecting them.
- Reviewing suggested generic-to-store product matches and adding, changing, removing, or approving links.
- Creating and maintaining grade-level templates.
- Reviewing reports with case-limited private-content access, recording decisions, and hiding, restoring, or removing reported content.
- Handling privacy removals, including retained ownerless lists and affected generated files.
- Associating school-name variants and locality for search and other school matching.

Administrative review of store suggestions and shared supplies must remain distinguishable from user-facing upvotes. An administrator's approval of a generic supply or product match does not imply that a school list is official.

The first release uses one administrative role with separate administrative identities, the bootstrap/recovery process in section 3.2, and mandatory case limits for private-content review. More granular administrative roles and a user-suspension workflow are deferred; they are not prerequisites for the stated first-release moderation actions.

## 13. Platform, infrastructure, and data

### 13.1 Agreed technologies

- **Frontend:** Angular and TypeScript.
- **Backend:** Rust, providing the application API, authorization, and business rules.
- **Database:** PostgreSQL for lists, supplies, accounts, versions, feedback, permissions, and related data.
- **Email:** Google Workspace for launch; the exact SMTP-relay or Gmail API integration can be chosen during implementation.
- **Hosting:** Vultr has been considered, but no hosting provider or production deployment arrangement has been selected.
- **Development:** Rust and Angular can run directly on Linux. PostgreSQL can be installed locally; an optional Docker Compose setup for PostgreSQL is also acceptable. Docker is not a prerequisite for all development.

The project owner created a local PostgreSQL database named **`escolar`**. Its initially empty `catalog` and `store_snapshot` schemas have since been created and populated with a starter taxonomy, generic items, a catalog-only store snapshot, and pending match suggestions. The remaining application data model and the user-facing catalog and administrator interfaces are not yet implemented. See the [catalog database guide](../db/README.md) for the connection and review workflow.

An earlier catalog experiment in this workspace used a **separate**, isolated local PostgreSQL cluster under `.local/` and a database named `lista_escolar`; it did not use the owner's `escolar` database. Its schema and import scripts are prototypes, not a substitute for implementing this specification.

### 13.2 Data model responsibilities

The implementation will need persistent representations for at least:

- Regular users, authentication methods, display names, verification state, recovery tokens, and PDF layout, paper-size, and color preferences.
- Separate administrative identities and administrative access.
- School-name associations and aliases, optional comuna/region identifiers, and the original free-text school and class entry.
- Categories, subcategories, typed attributes, generic supplies, alternative names, and shared-item review states.
- The imported store-product snapshot, variants and other source references, suggested matches, confirmed matches, and review decisions.
- Lists, original creator attribution, current ownership, collaborators, access grants and requests, visibility, lifecycle/moderation state, revisioned drafts, published content snapshots, version history, and optional versioned logos.
- Stable list-item occurrence identities and published names, attributes, quantities, units, notes, categories, and order. Catalog identifiers alone are not item identities or complete published content.
- Grade-level templates, independent list copies, expiring spreadsheet-import review data, and deduplicated import/publication request results.
- Version-specific upvotes and comments; reports, scoped case evidence, decisions, and a minimal access/action audit.
- Following subscriptions, durable publication events and recipient jobs, delivery outcomes, and user-specific checklist state and review flags per published version.
- Accepted and pending ownership transfers, ownerless archives, list deletion, and account-deletion dispositions and privacy cleanup.

The database should enforce relationships, required fields, uniqueness where appropriate, and valid attribute and quantity types. Enforce one current owner except for retained ownerless public archives, one vote per user/version, and uniqueness for retried publication/import operations and notification jobs. State transitions that depend on the same list or account must not interleave into an unauthorized result. The Rust backend must enforce authorization and privacy; client-side interface checks alone are not sufficient. Store product references must not be mistaken for administrator-approved matches until reviewed.

### 13.3 Mobile, PWA, and quality

- The Spanish interface should be usable on phones as well as larger screens, including the list editor, search, shared lists, and PDF options.
- Installation on a supported device's home screen is optional. A user can continue using the site normally in a browser and follow public links without installing it.
- The first version includes a helpful offline message. Editing lists and synchronizing progress require an internet connection; a PDF already downloaded to the device can be used offline. Cache only the static application shell, following the dynamic-content restrictions in section 3.3.
- Installation flows and platform support vary by browser and device.
- Design and implementation should support accessible, readable forms and controls, including keyboard and touch use.

## 14. Acceptance checkpoints

Before the first release is considered complete, the implementation should demonstrate at least these end-to-end outcomes:

1. A person can sign up, verify an email-and-password account or use Google sign-in, create a class list, and publish it with school, class, year, and valid item quantities and units. Password reset invalidates the old reset link and existing sessions; regular accounts cannot enter the administrative portal.
2. A visitor can find an active public list by school and class, distinguish same-name schools by known locality, open its latest version, and download a PDF. A private list is inaccessible without an explicit grant; missing locality does not cause an automatic school association.
3. A creator can search generic catalog items, add custom items, choose whether to share them, adjust categories and ordering, and see pending shared items labeled appropriately.
4. An administrator can approve, merge, or reject a pending supply and review a suggested store-product match without automatically publishing unreviewed matches.
5. A user can import `.xlsx` or CSV data, choose a worksheet, map columns including units, review every included row, correct or exclude invalid rows, resolve ambiguity and duplicates, and add the confirmed items to a draft. Validate decimal-comma and packaging examples, including two boxes of twelve pencils without conversion to two pencils.
6. An owner or collaborator can publish a changed version. The stable link opens the current version; prior versions remain identifiable, upvotes start fresh, and eligible followers receive a notification under normal delivery conditions. A provider failure leaves the publication intact and produces a tracked delivery outcome.
7. A signed-in parent can save checklist progress. Reordering and category changes preserve it; quantity, unit, packaging, supply, and note changes reset affected checks and flag review. Test repeated catalog supplies, removed/re-added rows, skipped versions, and edits to historical progress without overwriting newer progress.
8. A user can choose among the PDF layouts, choose Carta or A4 and color or black and white, preview the output, and override saved preferences for one download without replacing defaults. PDFs have empty checkboxes regardless of app progress; draft previews are visibly unpublished and restricted to editors.
9. Owners and editors can manage active-list access within their permissions; only the owner controls comment availability, ownership transfer, archiving, restoration, and normal deletion. Viewers cannot fetch drafts. A forwarded email invitation does not grant another account access.
10. Authorized signed-in users can vote on active public or private versions, comment when enabled, and report accessible content. Disabling comments preserves existing readable comments. Administrators can inspect the scoped evidence and take moderation actions without browsing unrelated private content; closure removes case content copies.
11. Account deletion removes attribution, comments, votes, access, and personal state. Public published lists without an accepted transfer become ownerless read-only archives; private and unpublished owned lists are deleted with explicit confirmation. Prior transfers preserve the new owner's rights. Name removal is not presented as guaranteed anonymization, and privacy reports remain actionable.
12. The app works as a Spanish-language website on mobile and desktop and can optionally be installed as a PWA on supported devices.

The following failure and boundary checks are also release requirements:

13. Two editors saving from the same revision cannot silently overwrite each other. A conflicting publication requires review again; simultaneous publication and repeated request identifiers create no duplicate version or notification event. Reusing an identifier with another payload fails. Removed editor permissions or an intervening archive/delete action prevent a stale write or publication; moderation hiding blocks publication while retaining authorized draft access.
14. After a public-to-private change or access revocation, unauthorized requests to stable links, historical versions, comments, previews, PDFs, and logos fail. Cached app routes and the service worker cannot serve retained content. An unauthorized recipient's pending email is suppressed before dispatch, and restoring access does not silently restore a canceled subscription.
15. An import interrupted or canceled before confirmation leaves the draft and shared catalog unchanged. A successful confirmation whose response is lost can be retried without duplicates, including after temporary uploads are removed. A concurrent draft change requires review again. Oversized, malformed, and formula-containing mapped input fails with a clear correction before mutation.
16. Ownership changes only on valid recipient acceptance. An expired offer, repeated acceptance, or account deletion during a pending transfer cannot create two owners, expose a draft, or leave an editable ownerless list. An ordinary owner can restore an archive without publishing its draft; collaborators cannot restore it. Ownerless archives retain accessible links and remain excluded from public search.
17. Visually inspect rendered PDFs against the approved concepts using short and long lists, long names/notes/instructions, repeated supplies, optional logos, and multiple pages across **all 12 combinations** of three layouts, two paper sizes, and two color modes. Verify complete readable content, units, checkboxes, version identification, and no clipping or empty category headings at page breaks. A successful file-generation test alone does not satisfy this checkpoint.
18. Catalog merges preserve published content and checklist state. Privacy redaction or attribution removal invalidates affected generated files across historical versions; deleted content is not re-exposed through a report snapshot, stale job, cache, or regenerated PDF.

## 15. Open decisions and dependencies

The product rules above are settled defaults for implementation. The following external dependencies and operational choices still require evidence or configuration; they do not replace the confirmed scope:

- Confirm and register `listacole.cl`; no domain availability or trademark conclusion has been established.
- Select hosting, production database arrangement, backups, retention/purge schedules, and operational ownership. Set recovery objectives and rehearse restoring a backup, including reapplying deletions and privacy removals before serving restored data. The launch audience size and launch date are unknown; establish a capacity and monitoring baseline before public launch.
- Select the specific Google Workspace sending method, configure a verified sending domain, and establish delivery monitoring and handling for provider limits.
- Obtain real example spreadsheets and, where possible, representative long lists to validate imports and multi-page PDF layouts.
- Continue curating the store-derived catalog. The dump contains many products beyond school supplies; automatic normalization cannot be assumed complete or accurate without review.
- Choose and validate the school-locality reference data, matching implementation, and resource limits for parsing and rendering within the product behavior defined here. Any revision of the initial upload/quantity limits should be reflected in both the specification and validation messages.

## 16. Decisions that supersede earlier ideas

- Account-free list creation was considered, then replaced with **sign-in required** for creation, voting, commenting, and reporting; public viewing remains open.
- English support was considered, then deferred: the first release is **Spanish only**.
- A teacher verification badge was explored, then explicitly deferred to avoid friction. Lists remain community-created, with no teacher badge in the first release.
- Parent-facing store-product information was explored, then deferred. Administrators still need product-linking tools in the first release.
- Self-hosted Stalwart and third-party transactional email were considered; the launch preference is **Google Workspace**.
- The app remains named **Lista Escolar** even though its preferred domain is **`listacole.cl`**.
- Owner-only permissions refer to the **current owner** after an accepted transfer, not permanently to the original creator. Ownerless public published lists retained after account deletion are archived, read-only, and absent from public search.
- Checklist matching uses stable item occurrences and explicit version-transition rules. First-release PDFs always contain empty checkboxes; personal app progress is not embedded in them.
