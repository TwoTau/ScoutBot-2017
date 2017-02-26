import {Page, NavController, Alert, Storage, Toast, SqlStorage} from 'ionic-angular';
import {Http} from '@angular/http';
import {File} from 'ionic-native';
import {TeamStorageService} from '../../providers/team-storage-service/team-storage-service';
import {GameDataService} from '../../providers/game-data-service/game-data-service';

@Page({
    templateUrl: 'build/pages/settings/settings.html',
    providers: [TeamStorageService, GameDataService]
})

export class SettingsPage {
    static get parameters() {
        return [[NavController], [Http], [TeamStorageService], [GameDataService]];
    }

    constructor(nav, http, teamService, dataService) {
        this.nav = nav;
        this.http = http;
        this.teamStorageService = teamService;
        this.dataService = dataService;

        this.storage = new Storage(SqlStorage);

        this.allTeams = [];

        this.eventCode = false;

        this.storage.get("darkscheme").then(value => {
            this.darkscheme = (value === undefined) ? false : value;
        });

        this.storage.get("eventCode").then(value => {
            if(value !== "false" && value !== undefined) {
                this.eventCode = value;
                this.allTeams = this.teamStorageService.getTeams();
                document.getElementById("addChangeEvent").innerHTML = "Change event";
            }
        });

        this.storage.get("isMaster").then(value => {
            this.isMaster = (value === undefined) ? false : value;
        });

        this.storage.get("hasPitScouting").then(value => {
            this.hasPitScouting = (value === undefined) ? false : value;
        });

        this.storage.get("scout").then(value => {
            this.scout = (value === undefined) ? "" : value;
        });

        this.storage.get("colorNumber").then(value => {
            this.colorNumber = (value === undefined) ? "Red 1" : value;
        });
    }

    // NOTE: SqlStorage will set the value as a string, so all numbers or booleans are stringified
    updateStorage(key) {
        // console.log("Changed key '" + key + "'. Now, it is: " + this[key]);
        this.storage.set(key, this[key]);
    }

    // returns a URL to the BlueAllianceAPI to make a GET request to get event information
    makeUrl(eventCode) {
        return "https://www.thebluealliance.com/api/v2/event/" + eventCode + "/teams?X-TBA-App-Id=frc2976:post-season-scouting-app:v01"
    }

    // is the eventCode in the form of a BlueAllianceAPI event code
    isValidEventCode(eventCode) {
        let eventYear = +eventCode.substr(0, 4);
        if(eventYear < 2016 || eventYear > 2017 || eventCode < 8 || eventCode.length > 9) {
            return false;
        }

        let eventName = eventCode.substr(4);
        for(let i = 0; i < 10; i++) {
            if(eventName.indexOf(i + "") >= 0) {
                return false;
            }
        }

        return true;
    }

    onInvalidCode(invalidEventCode) {
        let message = "The event code <strong>" + invalidEventCode + "</strong> is not a valid Blue Alliance event code for this year or you do not have internet.";
        let alert = Alert.create({
            title: "Invalid event code",
            subTitle: message,
            buttons: ["Dismiss"]
        });
        this.nav.present(alert);
    }

    askForEventCode() {
        let prompt = Alert.create({
            title: "Add new event",
            message: "Enter the Blue Alliance event code for your event. To find this, go to your event on TBA and look at the end of the URL (e.x. 2016wasno, 2016ohcl, or 2016mawor). <strong>Requires internet connection</strong>.",
            inputs: [
                {
                    name: "eventcode",
                    placeholder: "2016wasno"
                }
            ],
            buttons: [
                {
                    text: "Cancel",
                    handler: data => {}
                },
                {
                    text: "Add",
                    handler: data => {
                        let eventCode = data.eventcode.toLowerCase();

                        if(this.isValidEventCode(eventCode)) { // it fits the format
                            this.http.get(this.makeUrl(eventCode)).subscribe(data => { // HTTP GET from the BlueAllianceAPI
                                this.teamStorageService.clearDb();
                                let teams = data.json();

                                // for some reason, a for-of loop doesn't work here
                                for(let i = 0; i < teams.length; i++) {
                                    this.teamStorageService.addTeamToDb(teams[i].team_number, teams[i].nickname, teams[i].website);
                                }

                                document.getElementById("addChangeEvent").innerHTML = "Change event";

                                this.eventCode = eventCode;
                                this.updateStorage("eventCode");
                                while(this.teamStorageService.teamsToAdd > 0) {}
                                this.allTeams = this.teamStorageService.getTeams();
                            }, error => { // not a recognized event code (404) or no internet connection
                                this.onInvalidCode(eventCode);
                            });
                        } else { // invalid format
                            this.onInvalidCode(eventCode);
                        }
                    }
                }
            ]
        });

        this.nav.present(prompt);
    }

    removeEventCode() {
        this.teamStorageService.clearDb();
        this.allTeams = [];

        this.eventCode = false;
        this.updateStorage("eventCode");

        document.getElementById("addChangeEvent").innerHTML = "Add event";
    }

    /* ========================================= */
    /*              EXPORTING STUFF              */
    /* ========================================= */

    teamNumberToName(teamNumber) {
        let team = this.allTeams.find(team => team.number === teamNumber);
        return team !== undefined ? team.name : "???";
    }

    exportAsCSV() {
        File.createFile(cordova.file.externalApplicationStorageDirectory, "game-data.csv", true).then((fileEntry) => {
            this.storage.query("SELECT * FROM scannedcodes").then(data => {
                let numCodes = data.res.rows.length;
                if(numCodes > 0) {
                    fileEntry.createWriter((fileWriter) => {
                        let csvContents = "ID,Team name,Team number,Scout Color Number,Scout Name,Foul,Dead Bot,Defense A Name,Defense A Makes,Defense A Misses,Defense B Name,Defense B Makes,Defense B Misses,Defense C Name,Defense C Makes,Defense C Misses,Defense D Name,Defense D Makes,Defense D Misses,Defense E Made,Auto Defense Attempted,Auto Defense Successful,Auto Ball Grabbed,Auto High Goal,Auto Low Goal,Teleop High Goal Makes,Teleop High Goal Misses,Teleop Low Goal Makes,Teleop Low Goal Misses,Endgame Challenged Tower,Endgame Scaled,High Shooting Role,Low Shooting Role,Breaching Role,Defending Role\n";
                        for(let i = 0; i < numCodes; i++) {
                            let code = data.res.rows.item(i).code;
                            let decodedDataObject = this.dataService.decode(code);
                            let decodedDataString = data.res.rows.item(i).id + "," + decodedDataObject.csvRow;

                            csvContents += decodedDataString + "\n";
                        }

                        fileWriter.write(csvContents);

                        this.nav.present(Toast.create({
                            message: "The CSV was exported.",
                            duration: 2000
                        }));
                    });
                }
            });
        });
    }
}
