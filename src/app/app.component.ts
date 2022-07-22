import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormControl } from '@angular/forms';
import { CalendarEvent } from 'angular-calendar';
import axios from 'axios';
import { Observable } from 'rxjs';
import {map, startWith} from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'scu-schedule-planner';

  rawInput: String = "";
  watchlist: String[];

  includeWeekends = false;

  courses: {[name: string]: boolean};;

  results: CourseavailResult[] = [];

  autocompleteList:String[] = [];
  myControl = new FormControl('');
  filteredOptions: Observable<String[]>;
  private _filter(value: String): String[] {
    const filterValue = value.toLowerCase();

    return this.autocompleteList.filter(option => option.toLowerCase().includes(filterValue));
  }

  viewDate: Date = new Date(2022,8,18);

  events: CalendarEvent[] = [];


  preferredTimes = ["morning","afternoon","evening"];
  selectionSettings: Settings = {
    earliest: '08:00',
    latest: '20:00',
    preferredTime: 'morning',
    maxB2B: 3,
    maxUnits: 20
  }

  constructor(private http: HttpClient){
    this.filteredOptions = this.myControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filter(value || '')),
    );
    this.watchlist = JSON.parse(localStorage.getItem("watchlist") ?? "[]");
    this.courses = JSON.parse(localStorage.getItem("courses") ?? "{}");
    console.log(this.watchlist);
    this.requestClassInfo();
    this.requestCourselist();
  }

  async requestCourselist(){
    const data: any = await this.http.get("http://localhost:3000/courses").toPromise();
    this.autocompleteList = data.results.map((s: AutocompleteCourse) => s.value);
    console.log(data.results);
  }

  optionClicked(course: String){
    this.rawInput = course;
    this.makeQuery();
  }

  async requestClassInfo(): Promise<void>{
    if(this.watchlist.length == 0){
      return;
    }
    const watchlist = this.watchlist.join(",");
    const data: any = await this.http.get("http://localhost:3000/info?ids=" + watchlist).toPromise();
    this.results = data.results;
    let selected = JSON.parse(localStorage.getItem("selected") ?? "[]");
    for(let result of this.results){
      result.selected = selected.includes(result.class_nbr);
    }
    console.log(this.results[0]);
    this.getCourseNames();
    this.updateEvents();
  }

  get coursesArr(): string[]{
    return Object.keys(this.courses).sort();
  }

  getCourseNames(){
    for(let result of this.results){
      if(this.courses[result.subject + " " + result.catalog_nbr] == null){
        this.courses[result.subject + " " + result.catalog_nbr] = true;
      }
    }
  }

  eventClicked($event: any){
    const classNbr = $event.event.meta.section;
    let course = this.results.find(c => c.class_nbr == classNbr);
    if(course==null){
      return;
    }
    course.selected = !(course.selected ?? false);
    this.updateEvents();
  }

  updateEvents(): void{
    localStorage.setItem("courses", JSON.stringify(this.courses));
    this.saveSelected();
    const events: CalendarEvent[] = [];
    const selected = this.results.filter(c => c.selected ?? false);
    for(let course of this.results){
      events.push(...this.courseavailToEvent(course,selected));
    }
    this.events = events;
  }

  removeCourse(course: string): void{
    delete this.courses[course];
    console.log(this.courses);
    for(let i=0; i<this.results.length; i++){
      const result = this.results[i];
      if(result.subject + " " + result.catalog_nbr == course){
        this.results.splice(i,1);
        let watchlistIndex = this.watchlist.indexOf(result.class_nbr);
        if(watchlistIndex>=0){
          this.watchlist.splice(watchlistIndex,1);
        }
        i--;
      }
    }
    localStorage.setItem("watchlist", JSON.stringify(this.watchlist));
    this.getCourseNames();
    this.updateEvents();
  }

  async makeQuery(){
    console.log(this.rawInput);
    let codes = this.rawInput.split(",");
    for(let code of codes){
      if(code.split(" ").length<2){
        continue;
      }
      const data: any = await this.http.get("http://localhost:3000/query?query="+code).toPromise();
      const courses: CourseavailResult[] = data.results;
      this.rawInput = "";
      //add non-duplicate courses to this.results
      for(let course of courses){
        if(this.results.find(c => c.class_nbr == course.class_nbr) == null){
          this.results.push(course);
          this.watchlist.push(course.class_nbr)
        }
      }
    }
    localStorage.setItem("watchlist", JSON.stringify(this.watchlist));
    this.getCourseNames();
    this.updateEvents();
  }

  saveSelected(): void{
    const selected = this.results.filter(c => c.selected ?? false);
    const ids = selected.map(c => c.class_nbr);
    localStorage.setItem("selected",JSON.stringify(ids));
  }

  courseavailToEvent(ca: CourseavailResult, selected: CourseavailResult[]): CalendarEvent[]{
    const events: CalendarEvent[] = [];
    const title = ca.subject + " " + ca.catalog_nbr;
    if(!this.courses[title]){
      return [];
    }
    //If the title matches a selected course, return an empty array
    if(selected.find(c => c.subject + " " + c.catalog_nbr == title) != null && !(ca.selected ?? false)){
      return [];
    }
    if(this.hasCollision(ca, selected)){
      return [];
    }
    const days = ca.mtg_days_1.split("");
    const startHour = Number(ca.c_hrstart);
    const startMinute = Number(ca.c_mnstart);
    const endMinute = startMinute + ca.c_duration;
    const year = 2022;
    const month = 8;
    for(let day of days){
      const start = new Date(year, month, 18+this.dayStrToNum(day), startHour, startMinute);
      const end = new Date(year, month, 18+this.dayStrToNum(day), startHour, endMinute);
      events.push({
        title: title,
        start: start,
        end: end,
        cssClass: (ca.selected ?? false) ? "selected" : "deselected",
        color: {
          primary: (ca.selected ?? false) ? '#fffff' : (Number(ca.seats_remaining) >0 ? "#0288d1" : "#888888"),
          secondary: (ca.selected ?? false) ? '#b30738' : (Number(ca.seats_remaining) >0 ?"#81d4fa" : "#dddddd")
        },
        meta: {
          section: ca.class_nbr,
          prof: ca.instr_1_sh,
          seats: Number(ca.seats_remaining),
          loc: ca.l_cname ?? ca.mtg_facility_1,
          time: ca.time1_fr+"-"+ca.mtg_time_end_1
        }
      });
    }
    return events;
  }

  hasCollision(ca: CourseavailResult, selected: CourseavailResult[]): boolean{
    if(ca.selected){
      return false;
    }
    const courseDays = ca.mtg_days_1.split("");
    const courseStartHour = Number(ca.c_hrstart);
    const courseStartMinute = Number(ca.c_mnstart);
    const courseEndMinute = courseStartMinute + ca.c_duration;
    for(let s of selected){
      let sDays = s.mtg_days_1.split("");
      //see if days overlap
      if(!sDays.map(d => courseDays.includes(d)).includes(true)){
        continue;
      }
      const courseStart = new Date(2022, 1, 1, courseStartHour, courseStartMinute);
      const courseEnd = new Date(2022, 1, 1, courseStartHour, courseEndMinute);
      const sStart = new Date(2022, 1, 1, Number(s.c_hrstart), Number(s.c_mnstart));
      const sEnd = new Date(2022, 1, 1, Number(s.c_hrstart), Number(s.c_mnstart) + Number(s.c_duration));
      //check if times overlap
      if(courseStart.getTime() <= sEnd.getTime() && courseEnd.getTime() >= sStart.getTime()){
        return true;
      }
    }
    return false;

  }

  dayStrToNum(day: string): number{
    switch(day){
      case "U":
        return 0;
      case "M":
        return 1;
      case "T":
        return 2;
      case "W":
        return 3;
      case "R":
        return 4;
      case "F":
        return 5;
      case "S":
        return 6;
      default:
        return 0;
    }
  }

}

interface CourseavailResult{
  c_duration: number,
  c_hrstart: string,
  c_mnstart: string,
  mtg_days_1: string,
  seats_remaining: string,
  seats_text: string,
  class_descr: string,
  course_descr: string,
  catalog_nbr: string,
  class_nbr: string, // ######
  subject: string,
  instr_1_sh: string,
  l_cname: string,
  mtg_facility_1: string,
  selected?: boolean,
  isCustom?: boolean,
  mtg_time_beg_1: string,
  mtg_time_end_1: string,
  time1_fr: string,
}

interface AutocompleteCourse{
  value: string,
  label: string,
  subject: string,
  s: string,
  d: string,
}

interface Settings{
  earliest: string,
  latest: string,
  preferredTime: string,
  maxB2B: number,
  maxUnits: number,
}