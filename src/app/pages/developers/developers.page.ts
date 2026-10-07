import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageLayoutComponent } from '../../components/page-layout/page-layout.component';

interface Developer {
  name: string;
  role: string;
  description: string;
  photo?: string;
}

@Component({
  selector: 'app-developers',
  templateUrl: './developers.page.html',
  styleUrls: ['./developers.page.css'],
  standalone: true,
  imports: [CommonModule, PageLayoutComponent],
})
export class DevelopersPage {
  developers: Developer[] = [
    {
      name: 'Morley Sibal',
      role: 'Lead Developer and Backend Developer',
      description:
        'Led the core architecture and guided the team through delivery.',
      photo: 'assets/Profiles/morley.png',
    },
    {
      name: 'Gian Bautista',
      role: 'Frontend and Backend Developer',
      description:
        'Developed the user interface and implemented backend functionality.',
      photo: 'assets/Profiles/gianpic.jpg',
    },
    {
      name: 'Navarro Yu',
      role: 'Frontend Developer and UI/UX Designer',
      description:
        'Designed the user interface and ensured a seamless user experience.',
      photo: 'assets/Profiles/yuu.jpg',
    },
    {
      name: 'Arianne Kaye Tupaen',
      role: 'Frontend Developer and UI/UX Designer',
      description:
        'Contributed to the frontend development and assisted in UI/UX design.',
      photo: 'assets/Profiles/arianne.jpg',
    },
    {
      name: 'Nemarl Villafrance',
      role: 'UI/UX Designer and QA Tester',
      description:
        'Focused on user experience design and conducted quality assurance testing.',
      photo: 'assets/Profiles/nemarl.jpeg',
    },
  ];

  getInitials(name: string): string {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
}
