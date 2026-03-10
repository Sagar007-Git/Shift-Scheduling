// "without sharing" is MANDATORY for Public Sites so the Guest User 
// can read/write data bypassing standard org sharing blocks.
public without sharing class SchedulerController {
    
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getSchedulerData(String adminId) {
        Map<String, Object> dataMap = new Map<String, Object>();
        try {
            // 1. Validate Admin Identity
            // Ensure the provided ID is actually an Admin.
            List<Contact> adminRecords = [SELECT Is_Admin__c, Specialization__c 
                                          FROM Contact 
                                          WHERE Id = :adminId AND Is_Admin__c = true 
                                          LIMIT 1];
            
            if (adminRecords.isEmpty()) {
                throw new AuraHandledException('Unauthorized Access: Invalid Admin ID.');
            }

            String expertise = adminRecords[0].Specialization__c;
            dataMap.put('adminSpecialty', expertise);

            // 2. Query ONLY Contacts within that specialization
            // AND ensure we don't show Admins in the scheduling grid.
            List<Contact> filteredContacts = [
                SELECT Id, Name, Department__c, Primary_Location__r.Name, Specialization__c 
                FROM Contact 
                WHERE Specialization__c = :expertise 
                AND Is_Admin__c = false
                ORDER BY Name ASC 
                LIMIT 500
            ];
            dataMap.put('contacts', filteredContacts);

            // 3. Query ONLY Shifts belonging to those filtered contacts
            Set<Id> contactIds = new Set<Id>();
            for(Contact c : filteredContacts) { 
                contactIds.add(c.Id); 
            }

            dataMap.put('shifts', [
                SELECT Id, ShiftNumber, Contact__c, Shift_Date__c, Shift_Type__c, 
                       Label, StartTime, EndTime, Scheduling_Status__c, Location__c
                FROM Shift 
                WHERE Contact__c IN :contactIds
                ORDER BY Shift_Date__c ASC
            ]);

            // 4. Return all locations for the picklists
            dataMap.put('locations', [SELECT Id, Name FROM Location ORDER BY Name ASC]);

        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
        return dataMap;
    }
    
    @AuraEnabled
    public static void updateShiftAssignment(Id shiftId, Id newContactId, Date newDate, Long newStartMs) {
        try {
            Shift s = [SELECT Id, StartTime, EndTime FROM Shift WHERE Id = :shiftId LIMIT 1];
            Long durationMs = s.EndTime.getTime() - s.StartTime.getTime();

            s.Contact__c = newContactId;
            s.Shift_Date__c = newDate;

            if (newStartMs != null) {
                // FIX: newInstance(Long) automatically handles absolute Epoch time
                s.StartTime = Datetime.newInstance(newStartMs);
                s.EndTime = Datetime.newInstance(newStartMs + durationMs);
            }

            update s; 
        } catch (Exception e) {
            throw new AuraHandledException('Update Assignment Error: ' + e.getMessage());
        }
    }
    
    @AuraEnabled    
    public static void createOrUpdateShift(
        Id contactId, Date shiftDate, String shiftType, 
        String status, Id locationId, 
        Long startMs, Long endMs, 
        String description, Id existingId,
        Boolean isRecurring, String recurrencePattern, Date recurrenceEndDate, String selectedDays) {
        
        try {
            String finalLabel = String.isBlank(description) ? 'Shift' : description;

            // ==========================================================
            // PATH A: THE SERIES GENERATOR (NEW REPEATING SHIFTS)
            // ==========================================================
            if (isRecurring != null && isRecurring == true && existingId == null) {
                
                if (recurrenceEndDate == null) {
                    throw new AuraHandledException('End Date is required to generate a repeating schedule.');
                }
                
                if (shiftDate > recurrenceEndDate) {
                    throw new AuraHandledException('The End Date must be after the Shift Start Date.');
                }
                
                List<Shift> shiftsToInsert = new List<Shift>();
                String seriesId = 'REC-' + String.valueOf(Datetime.now().getTime()) + '-' + String.valueOf(Math.abs(Crypto.getRandomInteger())).right(4);
                
                Date currDate = shiftDate;
                
                // Track absolute time to prevent Timezone/Daylight Saving drift
                Datetime originalStart = Datetime.newInstance(startMs);
                Integer durationSeconds = (Integer)((endMs - startMs) / 1000);

                Integer loopFailsafe = 0;

                while (currDate <= recurrenceEndDate && loopFailsafe < 500) {
                    loopFailsafe++;
                    Boolean createShiftToday = false;
                    
                    // --- THE PATTERN MATH ENGINE ---
                    if (recurrencePattern == 'Daily') {
                        createShiftToday = true;
                    } 
                    else if (recurrencePattern == 'Weekly') {
                        createShiftToday = (Math.mod(shiftDate.daysBetween(currDate), 7) == 0);
                    } 
                    else if (recurrencePattern == 'Bi-Weekly') {
                        createShiftToday = (Math.mod(shiftDate.daysBetween(currDate), 14) == 0);
                    } 
                    else if (recurrencePattern == 'Custom Weekly' && String.isNotBlank(selectedDays)) {
                        // ✨ 100% LOCALE-IMMUNE DAY MATH ✨
                        // Jan 7, 1900 was a Sunday. We use pure math to find the day of the week.
                        Date knownSunday = Date.newInstance(1900, 1, 7);
                        Integer daysElapsed = knownSunday.daysBetween(currDate);
                        Integer dayOfWeekIndex = Math.mod(daysElapsed, 7); 
                        
                        List<String> safeDayNames = new List<String>{'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'};
                        String exactDayName = safeDayNames[dayOfWeekIndex];
                        
                        if (selectedDays.contains(exactDayName)) {
                            createShiftToday = true;
                        }
                    } 
                    else if (recurrencePattern == '4-ON-2-OFF') {
                        Integer cycleDay = Math.mod(shiftDate.daysBetween(currDate), 6);
                        if (cycleDay < 4) { createShiftToday = true; }
                    }

                    if (createShiftToday) {
                        Shift s = new Shift();
                        s.Contact__c = contactId;
                        s.Shift_Date__c = currDate;
                        s.Shift_Type__c = shiftType;
                        s.Scheduling_Status__c = status;
                        s.Location__c = locationId;
                        s.Label = finalLabel;
                        
                        Integer daysOffset = shiftDate.daysBetween(currDate);
                        s.StartTime = originalStart.addDays(daysOffset);
                        s.EndTime = s.StartTime.addSeconds(durationSeconds);
                        
                        s.Is_Recurring__c = true;
                        s.Recurrence_ID__c = seriesId;
                        s.Recurrence_Pattern__c = recurrencePattern;

                        shiftsToInsert.add(s);
                    }

                    currDate = currDate.addDays(1);
                    if (shiftsToInsert.size() >= 365) { break; }
                }
                
                // ✨ FIX: Warn the user if zero shifts were created because the dates didn't overlap the chosen pattern
                if (shiftsToInsert.isEmpty()) {
                    throw new AuraHandledException('No shifts generated. Ensure your selected End Date spans across the required pattern days.');
                }
                
                insert shiftsToInsert; 

            } 
            // ==========================================================
            // PATH B: STANDARD SINGLE CREATE OR UPDATE
            // ==========================================================
            else {
                Shift s = new Shift();
                if (existingId != null) { s.Id = existingId; }
                
                s.Contact__c = contactId;
                s.Shift_Date__c = shiftDate;
                s.Shift_Type__c = shiftType;
                s.Scheduling_Status__c = status;
                s.Location__c = locationId; 
                s.Label = finalLabel;
                s.StartTime = Datetime.newInstance(startMs);
                s.EndTime = Datetime.newInstance(endMs);

                if (existingId != null) {
                    if (isRecurring != null && isRecurring == false) {
                        s.Is_Recurring__c = false;
                        s.Recurrence_ID__c = null;
                        s.Recurrence_Pattern__c = 'None';
                    }
                    update s;
                } else {
                    insert s;
                }
            }
            
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    @AuraEnabled
    public static void bulkUpdateShifts(List<Id> shiftIds, String status, Id locationId, String shiftType) {
        try {
            List<Shift> shiftsToUpdate = new List<Shift>();
            
            for(Id sId : shiftIds) {
                Shift s = new Shift(Id = sId);
                if (String.isNotBlank(status)) { s.Scheduling_Status__c = status; }
                if (locationId != null) { s.Location__c = locationId; }
                if (String.isNotBlank(shiftType)) { s.Shift_Type__c = shiftType; }
                shiftsToUpdate.add(s);
            }
            
            if (!shiftsToUpdate.isEmpty()) { update shiftsToUpdate; }
        } catch (Exception e) {
            throw new AuraHandledException('Bulk update failed: ' + e.getMessage());
        }
    }

    @AuraEnabled
    public static void resizeShiftDuration(Id shiftId, Integer addedMinutes) {
        try {
            Shift s = [SELECT Id, StartTime, EndTime FROM Shift WHERE Id = :shiftId LIMIT 1];
            s.EndTime = s.EndTime.addMinutes(addedMinutes);
            update s; 
        } catch (Exception e) {
            throw new AuraHandledException('Resize failed: ' + e.getMessage());
        }
    }

    @AuraEnabled
    public static void deleteShift(Id shiftId) {
        try {
            Shift s = [SELECT Id FROM Shift WHERE Id = :shiftId LIMIT 1];
            delete s; 
        } catch (Exception e) {
            throw new AuraHandledException('Delete failed: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static void updateShiftLabel(Id shiftId, String newLabel) {
        try {
            Shift s = new Shift(Id = shiftId, Label = newLabel);
            update s; 
        } catch (Exception e) {
            throw new AuraHandledException('Label Update failed: ' + e.getMessage());
        }
    }
}