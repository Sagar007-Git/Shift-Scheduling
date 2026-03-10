# 🚀 Enterprise Workforce & Shift Scheduler

A high-performance, interactive scheduling engine built on Salesforce Lightning Web Components (LWC) and Apex. Designed for complex workforce management, this tool handles everything from simple drag-and-drop assignments to complex mathematical shift recurrence patterns.

## 🌟 Key Features

### 📅 Advanced Scheduling Logic

- **Multi-View Support**: Seamlessly switch between Daily, Weekly, and Monthly views
- **Sticky UI**: Optimized CSS with sticky leftmost columns and headers for effortless navigation through large datasets
- **Timezone Immune**: Built using absolute Epoch milliseconds to prevent "Timezone Drift" between different geographic locations

### 🔄 Intelligent Recurrence Engine

The crown jewel of this project is the **Series Generator**, allowing admins to create:

- **Standard Patterns**: Daily, Weekly, and Bi-Weekly
- **Custom Weekly**: Select specific days (e.g., Mon, Wed, Fri) using a sleek, interactive "Day Pill" UI
- **Rotating Rota**: Support for complex cycles like 4-ON-2-OFF
- **Locale-Independent Math**: Uses base-date calculations rather than string formatting to ensure reliability across all Salesforce Locales

### 🖱️ Interactive UX

- **Drag-and-Drop**: Move shifts between resources and dates with 15-minute grid snapping
- **Bulk Publishing**: One-click "Publish View" to move all visible shifts from 'Draft' to 'Published'
- **Conflict Visualization**: Real-time "Striped" warnings for overlapping shifts and a Heatmap Mode to identify over-utilized staff

### 🔒 Site & Security Optimized

- **Public Site Ready**: Optimized for Guest User Profiles using without sharing controllers and primitive data mapping to bypass standard sharing restrictions
- **Admin Validation**: Secure URL-based admin authentication to ensure only authorized personnel can modify the roster

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Lightning Web Components (LWC), Modern CSS (Flexbox, Grid, Sticky), JavaScript (ES6+) |
| **Backend** | Apex (SOQL, DML, Math-based logic engines) |
| **Platform** | Salesforce (Custom Objects, Public Sites, Field-Level Security) |

## 🏗️ Architecture Overview

The system uses a **Single-Source-of-Truth** pattern where the LWC handles the complex UI state, while a robust Apex controller manages the mathematical projection of shifts.

### Recurrence Logic

For the "Custom Weekly" feature, the system calculates the day of the week using a locale-immune mathematical formula:

```
DayIndex = (Date.newInstance(1900, 1, 7).daysBetween(CurrentDate)) mod 7
```

This ensures that "Monday" is always index 1, regardless of whether the user's browser is set to English, Spanish, or Hindi.

## 🚀 Installation & Setup

### Step 1: Deploy Metadata

Push the Shift object custom fields to your org:

- `Is_Recurring__c` - Boolean flag for recurring shifts
- `Recurrence_ID__c` - Unique identifier for recurrence series
- `Recurrence_Pattern__c` - Picklist for pattern type

### Step 2: Assign Permissions

Ensure the Site Guest User Profile has the following access:

- Read on Shift object
- Create on Shift object
- Edit on Shift object
- Field-Level Security for all custom fields

### Step 3: Update Picklist Values

Add the following values to the `Recurrence_Pattern__c` picklist:

- `Custom Weekly`
- `4-ON-2-OFF`
- *(Existing: Daily, Weekly, Bi-Weekly)*

### Step 4: Deploy Code

Push the following components to your org:

1. **Apex Controller**: `SchedulerController.cls`
2. **LWC Component**: `schedulerGrid` folder (includes all .js, .html, .css files)

### Step 5: Verify Installation

1. Navigate to your Salesforce site
2. Create a new Shift record to verify the custom fields are accessible
3. Test the scheduler LWC component on a custom page
4. Validate admin authentication with the provided URL parameters

## 📋 Configuration

### Custom Fields Setup

```
Object: Shift
Fields:
  - Is_Recurring__c (Checkbox)
  - Recurrence_ID__c (Text, 18 chars)
  - Recurrence_Pattern__c (Picklist)
  - Start_DateTime__c (DateTime)
  - End_DateTime__c (DateTime)
  - Resource__c (Lookup to User/Resource object)
  - Status__c (Draft, Published, Cancelled)
```

### Recurrence Patterns

| Pattern | Description | Example |
|---------|-------------|---------|
| Daily | Every day | Mon-Fri, every day |
| Weekly | Same day each week | Every Monday |
| Bi-Weekly | Every two weeks | Every other Monday |
| Custom Weekly | Specific days of week | Mon, Wed, Fri |
| Rotating Rota | Complex cycles | 4-ON-2-OFF |

## 💻 Usage Guide

### Creating a Shift

1. Click "New Shift" in the scheduler
2. Drag to select the time slot
3. Assign to a resource
4. Set as Draft or Published
5. For recurring shifts, select the recurrence pattern

### Using Drag-and-Drop

- **Move Shift**: Click and drag to a new time/resource
- **Grid Snapping**: Automatic 15-minute alignment
- **Conflict Detection**: Visual warnings for overlaps
- **Undo**: Use browser back or refresh to revert unsaved changes

### Bulk Operations

1. Select multiple shifts (Shift+Click)
2. Use "Publish View" to bulk-update status
3. Changes apply to all visible shifts in current view

### Viewing Conflicts

- **Striped Pattern**: Red-striped background indicates overlapping shifts
- **Heatmap Mode**: Color intensity shows resource utilization level
- **Warnings Panel**: Real-time list of all detected conflicts

## 🔐 Security Features

### Admin Authentication

Access is controlled via secure URL parameters:

```
https://your-site.com/schedule?adminKey=YOUR_SECURE_KEY&viewDate=2024-01-15
```

**Implementation**: Validate admin key in SchedulerController before returning sensitive data

### Data Visibility

- **Guest Users**: Limited to their own shifts and non-confidential data
- **Admins**: Full visibility and edit permissions
- **FLS Respect**: All field-level security is enforced

### API Security

- **Without Sharing**: Apex controllers use without sharing for Guest User access
- **Primitive Data Mapping**: Converts complex objects to simple data structures for public access
- **SOQL Filtering**: Always filter by user/resource context

## 📊 Performance Optimization

- **Lazy Loading**: Monthly view loads only visible weeks
- **Sticky Headers**: CSS-based (no JavaScript) for scroll performance
- **Efficient SOQL**: Single query with indexed lookups
- **Batch DML**: Groups updates to minimize API calls

### Recommended Governor Limits

For a single load of 500 shifts:

- SOQL Queries: ~5
- DML Operations: ~1 (on save)
- Heap Size: <2MB
- CPU Time: <100ms

## 🧪 Testing

### Unit Test Coverage

```apex
// Test recurrence generation
TestSchedulerRecurrence.testCustomWeeklyGeneration()
TestSchedulerRecurrence.testRotatingRotaCalculation()

// Test drag-and-drop updates
TestSchedulerController.testUpdateShiftTime()

// Test conflict detection
TestSchedulerController.testConflictDetection()
```

### Timezone Testing

1. Set browser timezone to UTC
2. Create shift for 9 AM
3. Change browser timezone to EST
4. Verify shift still shows 9 AM (no drift)

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Shifts appear on wrong days | Clear browser cache; verify epoch milliseconds in JS console |
| Drag-and-drop not working | Check Field-Level Security on Start_DateTime__c and End_DateTime__c |
| Recurrence pattern not saving | Verify picklist values are deployed; check Recurrence_Pattern__c FLS |
| Guest user cannot view shifts | Enable Read access on Shift object for Site Guest User Profile |
| Heatmap colors not showing | Verify CSS is deployed; check browser console for errors |

## 📞 Support & Maintenance

- **Bug Reports**: Document shift recurrence pattern, browser, timezone
- **Performance Issues**: Check SOQL query plan and DML batching
- **Customization**: Extend SchedulerController.cls for business rules

## 🔮 Future Enhancements

- [ ] Automated shift swap requests
- [ ] Integration with Time Off system
- [ ] Email notifications for shift changes
- [ ] Mobile-responsive design improvements
- [ ] Historical shift auditing
- [ ] Predictive understaffing alerts

## 📄 License & Credits

Enterprise Workforce & Shift Scheduler v1.0

Built for high-performance Salesforce environments with complex scheduling needs.

---

**Last Updated**: March 2024 | **Version**: 1.0
