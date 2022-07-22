import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'app-popup',
  templateUrl: './popup.component.html',
  styleUrls: ['./popup.component.scss']
})
export class PopupComponent implements OnInit {

  name: string;

  days: any = {};

  startTime = "08:00";
  endTime = "09:00";

  constructor() {
    this.name = '';
    this.days = {
      "M": false,
      "T": false,
      "W": false,
      "R": false,
      "F": false,
      "S": false,
      "U": false
    };

  }
  
  get daysList(){
    return ['M','T','W','R','F','S','U'];
  }

  ngOnInit(): void {
  }

  getDayLong(day: string): string{
    switch(day){
      case 'M':
        return 'Mon';
      case 'T':
        return 'Tue';
      case 'W':
        return 'Wed';
      case 'R':
        return 'Thu';
      case 'F':
        return 'Fri';
      case 'S':
        return 'Sat';
      case 'U':
        return 'Sun';
      default:
        return 'Unknown';
    }
  }

  create(){
    if(!this.addItem){
      return;
    }
    let days = Object.keys(this.days).filter(d => this.days[d]).join('');
    this.addItem(this.name, days, this.startTime, this.endTime);
  }

  cancel(){
    if(!this.closePopup){
      return;
    }
    this.closePopup();
  }

  @Input() addItem: ((name: string, days: string, startTime: string, endTime: string) => void) | undefined;
  @Input() closePopup: (() => void) | undefined;
  

}
