import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormControl } from '@angular/forms';
import { CalendarEvent } from 'angular-calendar';
import { Observable } from 'rxjs';
import {map, startWith} from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'scu-schedule-planner';

  rawInput: String = "";
  watchlist: String[] = [];

  includeWeekends = false;

  courses: {[name: string]: boolean} = {};

  quarters: Quarter[] = [];
  selectedQuarter: string | undefined;

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

  constructor(private http: HttpClient){
    this.filteredOptions = this.myControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filter(value || '')),
    );
    this.getQuarters();
  }

  async getQuarters(){
    const data: any = await this.http.get("http://localhost:3000/quarters").toPromise();
    this.quarters = data.indb;
    this.selectedQuarter = data.currdef.value.toString();
    this.changeQuarter();
  }

  async requestCourselist(){
    const data: any = await this.http.get("http://localhost:3000/courses?quarter="+this.selectedQuarter).toPromise();
    this.autocompleteList = data.results.map((s: AutocompleteCourse) => s.value);
  }

  optionClicked(course: String){
    this.rawInput = course;
    this.makeQuery();
  }

  async requestClassInfo(): Promise<void>{
    let selected = JSON.parse(localStorage.getItem(this.selectedQuarter+"-selected") ?? "[]");
    let customs = JSON.parse(localStorage.getItem(this.selectedQuarter+"-customs") ?? "[]");
    if(this.watchlist.length == 0){
      this.results = customs;
      this.getCourseNames();
      this.updateEvents();
      return;
    }
    const watchlist = this.watchlist.join(",");
    const data: any = await this.http.get("http://localhost:3000/info?quarter="+this.selectedQuarter+"&ids=" + watchlist).toPromise();
    this.results = data.results;
    for(let result of this.results){
      result.selected = selected.includes(result.class_nbr);
    }
    this.results.push(...customs);
    this.getCourseNames();
    this.updateEvents();
  }

  get coursesArr(): string[]{
    return Object.keys(this.courses).sort();
  }

  getCourseNames(){
    for(let result of this.results){
      let name = this.getCourseName(result);
      if(this.courses[name] == null && !result.isCustom){
        this.courses[name] = true;
      }
    }
  }

  eventClicked($event: any){
    const classNbr = $event.event.meta.section;
    let course = this.results.find(c => c.class_nbr == classNbr);
    if(course==null || course.isCustom){
      return;
    }
    course.selected = !(course.selected ?? false);
    this.updateEvents();
  }

  updateEvents(): void{
    localStorage.setItem(this.selectedQuarter+"-courses", JSON.stringify(this.courses));
    localStorage.setItem(this.selectedQuarter+"-customs", JSON.stringify(this.results.filter(c => c.isCustom ?? false)));
    this.saveSelected();
    const events: CalendarEvent[] = [];
    const selected = this.results.filter(c => (c.selected ?? false) || (c.isCustom ?? false));
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
      if(this.getCourseName(result) == course){
        this.results.splice(i,1);
        let watchlistIndex = this.watchlist.indexOf(result.class_nbr);
        if(watchlistIndex>=0){
          this.watchlist.splice(watchlistIndex,1);
        }
        i--;
      }
    }
    localStorage.setItem(this.selectedQuarter+"-watchlist", JSON.stringify(this.watchlist));
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
      const data: any = await this.http.get("http://localhost:3000/query?quarter="+this.selectedQuarter+"&query="+code).toPromise();
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
    localStorage.setItem(this.selectedQuarter+"-watchlist", JSON.stringify(this.watchlist));
    this.getCourseNames();
    this.updateEvents();
  }

  saveSelected(): void{
    const selected = this.results.filter(c => c.selected ?? false);
    const ids = selected.map(c => c.class_nbr);
    localStorage.setItem(this.selectedQuarter+"-selected",JSON.stringify(ids));
  }

  getCourseName(course: CourseavailResult): string{
    if(course.catalog_nbr == null){
      return course.subject;
    }
    return course.subject + " " + course.catalog_nbr;
  }

  get customList(): CourseavailResult[]{
    return this.results.filter(c => c.isCustom ?? false);
  }

  removeCustom(course: CourseavailResult): void{
    let index = this.results.indexOf(course);
    this.results.splice(index,1);
    this.updateEvents();
  }

  courseavailToEvent(ca: CourseavailResult, selected: CourseavailResult[]): CalendarEvent[]{
    const events: CalendarEvent[] = [];
    const title = this.getCourseName(ca);
    if(!this.courses[title] && !ca.isCustom){
      return [];
    }
    //If the title matches a selected course, return an empty array
    if(selected.find(c => this.getCourseName(c) == title) != null && !((ca.selected ?? false) || (ca.isCustom ?? false))){
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
      let selected = (ca.selected ?? false) || (ca.isCustom ?? false);
      events.push({
        title: title,
        start: start,
        end: end,
        cssClass: selected ? "selected" : "deselected",
        color: {
          primary: selected ? '#fffff' : (Number(ca.seats_remaining) > 0 ? "#0288d1" : "#888888"),
          secondary: selected ? '#b30738' : (Number(ca.seats_remaining) > 0 ?"#81d4fa" : "#dddddd")
        },
        meta: {
          section: ca.class_nbr,
          prof: ca.instr_1_sh,
          seats: Number(ca.seats_remaining),
          loc: ca.l_cname ?? ca.mtg_facility_1,
          time: ca.time1_fr+"-"+ca.mtg_time_end_1,
          isCustom: ca.isCustom ?? false
        }
      });
    }
    return events;
  }

  hasCollision(ca: CourseavailResult, selected: CourseavailResult[]): boolean{
    if(ca.selected || ca.isCustom){
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
      if(courseStart.getTime() <= sEnd.getTime() && courseEnd.getTime() > sStart.getTime()){
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

  showPopup = false;

  openPopup(){
    this.showPopup = true;
  }

  closePopup = () => {
    this.showPopup = false;
  }

  createCustom = (name: string, days: any, startTime: string, endTime: string) => {
    if(name.length == 0){
      alert("Please enter a name for your custom item");
      return;
    }
    if(days.length == 0){
      alert("Please enter at least one day for your custom item");
      return;
    }
    //compare start and end time
    const startHour = Number(startTime.split(":")[0]);
    const startMinute = Number(startTime.split(":")[1]);
    const endHour = Number(endTime.split(":")[0]);
    const endMinute = Number(endTime.split(":")[1]);
    //format start and end time as startTime-endTime
    let start = "";
    let end = "";
    if(startHour<13){
      start = startHour.toString();
    }
    else{
      start = (startHour-12).toString();
    }
    if(startMinute<10){
      if(startMinute!=0){
        start += ":0"+startMinute.toString();
      }
    }
    else{
      start += ":"+startMinute.toString();
    }
    if(startHour<12 && endHour>=12){
      start += "am";
    }

    if(endHour<13){
      end = endHour.toString();
    }
    else{
      end = (endHour-12).toString();
    }
    if(endMinute<10){
      if(endMinute!=0){
        end += ":0"+endMinute.toString();
      }
    }
    else{
      end += ":"+endMinute.toString();
    }
    if(endHour<12){
      end += "am";
    }
    else{
      end += "pm";
    }

    console.log(start,end);

    if((startHour > endHour)
      || (startHour == endHour && startMinute >= endMinute)
      || (startHour == endHour && startMinute == endMinute)){
      alert("Start time must be before end time");
      return;
    }
    let duration = (endHour - startHour) * 60 + (endMinute - startMinute);
    this.results.push({
      class_nbr: "custom-"+uuidv4(),
      c_duration: duration,
      isCustom: true,
      c_hrstart: startHour.toString(),
      c_mnstart: startMinute.toString(),
      mtg_days_1: days,
      seats_remaining: '1',
      subject: name,
      mtg_time_end_1: end,
      time1_fr: start,
    });
    this.showPopup = false;
    this.updateEvents();
  }

  changeQuarter(){
    this.watchlist = JSON.parse(localStorage.getItem(this.selectedQuarter+"-watchlist") ?? "[]");
    this.courses = JSON.parse(localStorage.getItem(this.selectedQuarter+"-courses") ?? "{}");
    console.log(this.watchlist);
    this.requestClassInfo();
    this.requestCourselist();
  }

}

interface CourseavailResult{
  c_duration: number,
  c_hrstart: string,
  c_mnstart: string,
  mtg_days_1: string,
  seats_remaining: string,
  catalog_nbr?: string,
  class_nbr: string, // ######
  subject: string,
  instr_1_sh?: string,
  l_cname?: string,
  mtg_facility_1?: string,
  selected?: boolean,
  isCustom?: boolean,
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

interface Quarter{
  value: string,
  label: string
}